use crate::{
    error::AppResult,
    models::SessionUser,
    state::AppState,
};
use axum::{
    extract::{Query, State},
    Extension, Json,
};
use deadpool_redis::redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct WeatherQuery {
    pub city: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeatherResp {
    pub city: String,
    pub temp: String,
    pub cond: String,
    pub humidity: String,
    pub wind: String,
    pub aqi: String,
    pub hours: Vec<WeatherHour>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WeatherHour {
    pub h: String,
    pub t: String,
    pub i: String,
}

pub async fn weather(
    State(state): State<Arc<AppState>>,
    Extension(_user): Extension<SessionUser>,
    Query(q): Query<WeatherQuery>,
) -> AppResult<Json<WeatherResp>> {
    let city = q.city.clone().unwrap_or_else(|| "北京".into());
    let cache_key = match (q.lat, q.lon) {
        (Some(la), Some(lo)) => format!("widget:weather:{:.3},{:.3}", la, lo),
        _ => format!("widget:weather:{}", city),
    };
    if let Ok(mut conn) = state.redis.get().await {
        let cached: Option<String> = conn.get(&cache_key).await.unwrap_or(None);
        if let Some(c) = cached {
            if let Ok(v) = serde_json::from_str::<WeatherResp>(&c) {
                return Ok(Json(v));
            }
        }
    }
    let out = if !state.cfg.weather.key.is_empty() {
        match fetch_hefeng(&state.reqwest_client, &city, q.lat, q.lon, &state.cfg.weather.key).await {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("hefeng failed: {e}, falling back to open-meteo");
                fetch_open_meteo(&state.reqwest_client, &city, q.lat, q.lon)
                    .await
                    .unwrap_or_else(|e| {
                        tracing::warn!("open-meteo failed: {e}, using static");
                        static_weather(&city)
                    })
            }
        }
    } else {
        fetch_open_meteo(&state.reqwest_client, &city, q.lat, q.lon)
            .await
            .unwrap_or_else(|e| {
                tracing::warn!("open-meteo failed: {e}, using static");
                static_weather(&city)
            })
    };
    if let Ok(payload) = serde_json::to_string(&out) {
        if let Ok(mut conn) = state.redis.get().await {
            let _: Result<(), _> = conn.set_ex(&cache_key, payload, 1800).await;
        }
    }
    Ok(Json(out))
}

fn static_weather(city: &str) -> WeatherResp {
    WeatherResp {
        city: city.to_string(),
        temp: "23°".into(),
        cond: "暂无数据".into(),
        humidity: "—".into(),
        wind: "—".into(),
        aqi: "—".into(),
        hours: vec![],
        source: "static".into(),
    }
}

async fn fetch_open_meteo(
    client: &reqwest::Client,
    city: &str,
    lat_override: Option<f64>,
    lon_override: Option<f64>,
) -> anyhow::Result<WeatherResp> {
    let (lat, lon, display_city) = match (lat_override, lon_override) {
        (Some(la), Some(lo)) => (la, lo, city.to_string()),
        _ => {
            let url = format!(
                "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=zh&format=json",
                urlencoding::encode(city)
            );
            let v: serde_json::Value = client.get(&url).send().await?.json().await?;
            let first = v
                .get("results")
                .and_then(|r| r.as_array())
                .and_then(|a| a.first())
                .ok_or_else(|| anyhow::anyhow!("city not found: {city}"))?;
            let la = first
                .get("latitude")
                .and_then(|x| x.as_f64())
                .ok_or_else(|| anyhow::anyhow!("no lat"))?;
            let lo = first
                .get("longitude")
                .and_then(|x| x.as_f64())
                .ok_or_else(|| anyhow::anyhow!("no lon"))?;
            let name = first
                .get("name")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| city.to_string());
            let country = first.get("country").and_then(|x| x.as_str()).unwrap_or("");
            let dc = if country.is_empty() {
                name.clone()
            } else {
                format!("{name} · {country}")
            };
            (la, lo, dc)
        }
    };

    let forecast_url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code&forecast_days=2&timezone=auto",
        lat, lon
    );
    let fv: serde_json::Value = client.get(&forecast_url).send().await?.json().await?;

    let current = fv.get("current").ok_or_else(|| anyhow::anyhow!("no current"))?;
    let temp = current.get("temperature_2m").and_then(|x| x.as_f64()).unwrap_or(0.0);
    let apparent = current
        .get("apparent_temperature")
        .and_then(|x| x.as_f64())
        .unwrap_or(temp);
    let code = current.get("weather_code").and_then(|x| x.as_i64()).unwrap_or(0) as u16;
    let humidity = current
        .get("relative_humidity_2m")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0);
    let wind_speed = current.get("wind_speed_10m").and_then(|x| x.as_f64()).unwrap_or(0.0);
    let wind_dir = current
        .get("wind_direction_10m")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0);

    let (cond_text, emoji) = wmo_info(code);

    let mut hours: Vec<WeatherHour> = Vec::new();
    if let (Some(times), Some(temps), Some(codes)) = (
        fv.pointer("/hourly/time").and_then(|x| x.as_array()),
        fv.pointer("/hourly/temperature_2m").and_then(|x| x.as_array()),
        fv.pointer("/hourly/weather_code").and_then(|x| x.as_array()),
    ) {
        let cur_t = fv
            .pointer("/current/time")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        let start = times
            .iter()
            .position(|t| t.as_str().map(|s| s >= cur_t).unwrap_or(false))
            .unwrap_or(0);
        for i in start..(start + 5).min(times.len()) {
            let t = times.get(i).and_then(|x| x.as_str()).unwrap_or("");
            let hh = t.split('T').nth(1).and_then(|s| s.split(':').next()).unwrap_or("--");
            let te = temps.get(i).and_then(|x| x.as_f64()).unwrap_or(0.0);
            let co = codes.get(i).and_then(|x| x.as_i64()).unwrap_or(0) as u16;
            hours.push(WeatherHour {
                h: hh.to_string(),
                t: format!("{:.0}°", te),
                i: wmo_info(co).1.to_string(),
            });
        }
    }

    Ok(WeatherResp {
        city: display_city,
        temp: format!("{:.0}°", temp),
        cond: format!("{emoji} {} · 体感 {:.0}°", cond_text, apparent),
        humidity: format!("{:.0}%", humidity),
        wind: format!("{} {:.1}km/h", wind_dir_label(wind_dir), wind_speed),
        aqi: "—".into(),
        hours,
        source: "open-meteo".into(),
    })
}

async fn fetch_hefeng(
    client: &reqwest::Client,
    city: &str,
    lat_override: Option<f64>,
    lon_override: Option<f64>,
    key: &str,
) -> anyhow::Result<WeatherResp> {
    let location = match (lat_override, lon_override) {
        (Some(la), Some(lo)) => format!("{:.5},{:.5}", lo, la), // hefeng uses lon,lat!
        _ => {
            let url = format!(
                "https://geoapi.qweather.com/v2/city/lookup?location={}&key={}",
                urlencoding::encode(city),
                key
            );
            let v: serde_json::Value = client.get(&url).send().await?.json().await?;
            let locs = v
                .get("location")
                .and_then(|l| l.as_array())
                .ok_or_else(|| anyhow::anyhow!("city not found in hefeng"))?;
            let first = locs.first().ok_or_else(|| anyhow::anyhow!("empty location in hefeng"))?;
            first.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string()
        }
    };

    if location.is_empty() {
        anyhow::bail!("failed to resolve location for hefeng");
    }

    let url = format!(
        "https://devapi.qweather.com/v7/weather/now?location={}&key={}",
        location, key
    );
    let v: serde_json::Value = client.get(&url).send().await?.json().await?;

    let now = v.get("now").ok_or_else(|| anyhow::anyhow!("no 'now' in hefeng resp"))?;
    let temp = now.get("temp").and_then(|x| x.as_str()).unwrap_or("0");
    let apparent = now.get("feelsLike").and_then(|x| x.as_str()).unwrap_or("0");
    let cond = now.get("text").and_then(|x| x.as_str()).unwrap_or("—");
    let humidity = now.get("humidity").and_then(|x| x.as_str()).unwrap_or("0");
    let wind_dir = now.get("windDir").and_then(|x| x.as_str()).unwrap_or("—");
    let wind_speed = now.get("windSpeed").and_then(|x| x.as_str()).unwrap_or("0");

    let emoji = hefeng_emoji(cond);

    let hourly_url = format!(
        "https://devapi.qweather.com/v7/weather/24h?location={}&key={}",
        location, key
    );
    let hv: serde_json::Value = client.get(&hourly_url).send().await?.json().await?;

    let mut hours: Vec<WeatherHour> = Vec::new();
    if let Some(arr) = hv.get("hourly").and_then(|h| h.as_array()) {
        for it in arr.iter().take(5) {
            let t = it.get("fxTime").and_then(|x| x.as_str()).unwrap_or("");
            let hh = t.split('T').nth(1).and_then(|s| s.split(':').next()).unwrap_or("--");
            let te = it.get("temp").and_then(|x| x.as_str()).unwrap_or("0");
            let c_text = it.get("text").and_then(|x| x.as_str()).unwrap_or("—");
            hours.push(WeatherHour {
                h: hh.to_string(),
                t: format!("{}°", te),
                i: hefeng_emoji(c_text).to_string(),
            });
        }
    }

    Ok(WeatherResp {
        city: city.to_string(),
        temp: format!("{}°", temp),
        cond: format!("{} {} · 体感 {}°", emoji, cond, apparent),
        humidity: format!("{}%", humidity),
        wind: format!("{} {}km/h", wind_dir, wind_speed),
        aqi: "—".into(),
        hours,
        source: "hefeng".into(),
    })
}

fn hefeng_emoji(cond: &str) -> &'static str {
    if cond.contains("晴") {
        "☀"
    } else if cond.contains("少云") {
        "🌤"
    } else if cond.contains("多云") {
        "⛅"
    } else if cond.contains("阴") {
        "☁"
    } else if cond.contains("雷") {
        "⛈"
    } else if cond.contains("雪") {
        "🌨"
    } else if cond.contains("雨") {
        "🌧"
    } else if cond.contains("雾") || cond.contains("霾") {
        "🌫"
    } else {
        "☁"
    }
}

fn wmo_info(code: u16) -> (&'static str, &'static str) {
    match code {
        0 => ("晴", "☀"),
        1 => ("少云", "🌤"),
        2 => ("多云", "⛅"),
        3 => ("阴", "☁"),
        45 | 48 => ("雾", "🌫"),
        51 | 53 | 55 => ("毛毛雨", "🌦"),
        56 | 57 => ("冻毛雨", "🌧"),
        61 | 63 | 65 => ("雨", "🌧"),
        66 | 67 => ("冻雨", "🌧"),
        71 | 73 | 75 => ("雪", "🌨"),
        77 => ("雪粒", "🌨"),
        80..=82 => ("阵雨", "🌦"),
        85 | 86 => ("阵雪", "🌨"),
        95 => ("雷暴", "⛈"),
        96 | 99 => ("雷暴冰雹", "⛈"),
        _ => ("—", "☁"),
    }
}

fn wind_dir_label(deg: f64) -> &'static str {
    let d = (deg % 360.0 + 360.0) % 360.0;
    match d as i32 {
        0..=22 | 338..=360 => "北",
        23..=67 => "东北",
        68..=112 => "东",
        113..=157 => "东南",
        158..=202 => "南",
        203..=247 => "西南",
        248..=292 => "西",
        293..=337 => "西北",
        _ => "—",
    }
}
