use crate::{
    auth::require_at_least_admin,
    error::{AppError, AppResult},
    handlers::util,
    models::{Group, SessionUser},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension,
};
use std::sync::Arc;
use uuid::Uuid;

use axum::Json;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use bytes::Bytes;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, QueryBuilder, Transaction};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub target_type: String,
    pub target_role: Option<String>,
    pub target_user_id: Option<Uuid>,
    pub push_allow_edit: Option<bool>,
}

pub async fn push(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
    Json(payload): Json<PushRequest>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;

    // API-1: 校验 target_type 与 role/user 字段的一致性,复用系统消息同款校验逻辑。
    let (target_type, target_role, target_user_id) = util::validate_push_target(
        &payload.target_type,
        payload.target_role.as_deref(),
        payload.target_user_id,
    )?;
    // target_type=user 时进一步确认目标用户存在(与系统消息一致)。
    if let Some(uid) = target_user_id {
        let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(&state.pg)
            .await?;
        if exists.is_none() {
            return Err(AppError::BadRequest("target user not found".into()));
        }
    }

    let g: Group = sqlx::query_as(
        "UPDATE groups SET pushed = TRUE, push_target_type = $2, push_target_role = $3, push_target_user_id = $4, push_allow_edit = $5, updated_at = now() \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(target_type)
    .bind(target_role)
    .bind(target_user_id)
    .bind(payload.push_allow_edit.unwrap_or(false))
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    util::audit(
        &state,
        Some(&user),
        "push_group",
        Some(g.name),
        "group",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn unpush(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    require_at_least_admin(user.role)?;
    let g: Group = sqlx::query_as(
        "UPDATE groups SET pushed = FALSE, push_target_type = 'all', push_target_role = NULL, push_target_user_id = NULL, push_allow_edit = FALSE, updated_at = now() \
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .fetch_optional(&state.pg)
    .await?
    .ok_or(AppError::NotFound)?;
    util::audit(
        &state,
        Some(&user),
        "unpush_group",
        Some(g.name),
        "group",
        None,
    )
    .await;
    Ok(StatusCode::NO_CONTENT)
}

use crate::models::{
    export::{
        ExportedAssetData, FolderItemData, GroupData, GroupExportData, IconExportData, WidgetData,
    },
    FolderItem, Icon, Widget,
};

pub async fn export(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<GroupExportData>> {
    require_at_least_admin(user.role)?;

    let group: Group = sqlx::query_as("SELECT * FROM groups WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pg)
        .await?
        .ok_or(AppError::NotFound)?;

    let icons: Vec<Icon> =
        sqlx::query_as("SELECT * FROM icons WHERE group_id = $1 ORDER BY sort_order ASC")
            .bind(id)
            .fetch_all(&state.pg)
            .await?;

    let widgets: Vec<Widget> =
        sqlx::query_as("SELECT * FROM widgets WHERE group_id = $1 ORDER BY sort_order ASC")
            .bind(id)
            .fetch_all(&state.pg)
            .await?;

    let icon_ids: Vec<Uuid> = icons.iter().map(|i| i.id).collect();
    let folder_items: Vec<FolderItem> = if icon_ids.is_empty() {
        vec![]
    } else {
        sqlx::query_as(
            "SELECT * FROM folder_items WHERE folder_icon_id = ANY($1) ORDER BY sort_order ASC",
        )
        .bind(&icon_ids)
        .fetch_all(&state.pg)
        .await?
    };

    let mut icon_data_list = Vec::with_capacity(icons.len());
    for ic in icons {
        let image_asset = export_image_asset(&state, ic.image_url.as_deref()).await;
        let mut item_data = Vec::new();
        for f in folder_items.iter().filter(|f| f.folder_icon_id == ic.id) {
            item_data.push(FolderItemData {
                name: f.name.clone(),
                letter: f.letter.clone(),
                color: f.color,
                url: f.url.clone(),
                image_url: f.image_url.clone(),
                image_asset: export_image_asset(&state, f.image_url.as_deref()).await,
                image_style: f.image_style.clone(),
                image_radius: f.image_radius.clone(),
                sort_order: f.sort_order,
            });
        }

        icon_data_list.push(IconExportData {
            name: ic.name,
            url: ic.url,
            sub: ic.sub,
            title: ic.title,
            cta: ic.cta,
            size: ic.size,
            letter: ic.letter,
            color: ic.color,
            image_url: ic.image_url,
            image_asset,
            image_style: ic.image_style,
            image_radius: ic.image_radius,
            is_folder: ic.is_folder,
            iframe_preview: ic.iframe_preview,
            sort_order: ic.sort_order,
            font_size: ic.font_size,
            text_align: ic.text_align,
            folder_items: item_data,
        });
    }

    let widget_data_list = widgets
        .into_iter()
        .map(|w| WidgetData {
            widget: w.widget_type,
            w_span: w.w_span,
            w_row: w.w_row,
            config: w.config,
            sort_order: w.sort_order,
        })
        .collect();

    Ok(Json(GroupExportData {
        group: GroupData {
            name: group.name.clone(),
            icon: group.icon.clone(),
        },
        icons: icon_data_list,
        widgets: widget_data_list,
    }))
}

pub async fn import(
    State(state): State<Arc<AppState>>,
    Extension(user): Extension<SessionUser>,
    Json(payload): Json<GroupExportData>,
) -> AppResult<(StatusCode, Json<Group>)> {
    require_at_least_admin(user.role)?;

    let group_name = payload.group.name.clone();
    let group_icon = payload.group.icon.clone();
    let mut icons = payload.icons;
    let widgets = payload.widgets;

    let mut tx = state.pg.begin().await?;

    let new_group: Group = sqlx::query_as(
        "INSERT INTO groups (id, name, icon, owner_id, pushed, sort_order) \
         VALUES (gen_random_uuid(), $1, $2, $3, FALSE, \
           COALESCE((SELECT MAX(sort_order)+1 FROM groups WHERE owner_id = $3), 100)) \
         RETURNING *",
    )
    .bind(&group_name)
    .bind(&group_icon)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    for ic in &mut icons {
        ic.image_url = materialize_exported_asset(
            &state,
            &mut tx,
            Some(user.id),
            ic.image_asset.as_ref(),
            ic.image_url.take(),
            &ic.name,
        )
        .await?;
        for f in &mut ic.folder_items {
            f.image_url = materialize_exported_asset(
                &state,
                &mut tx,
                Some(user.id),
                f.image_asset.as_ref(),
                f.image_url.take(),
                &f.name,
            )
            .await?;
        }
    }

    let mut prepared_icons = Vec::with_capacity(icons.len());
    let mut prepared_folder_items = Vec::new();
    for mut ic in icons {
        let icon_id = Uuid::new_v4();
        for f in ic.folder_items.drain(..) {
            prepared_folder_items.push(PreparedFolderItem {
                folder_icon_id: icon_id,
                data: f,
            });
        }
        prepared_icons.push(PreparedIcon {
            id: icon_id,
            data: ic,
        });
    }

    if !prepared_icons.is_empty() {
        let mut qb = QueryBuilder::<Postgres>::new(
            "INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, image_url, image_style, image_radius, is_folder, iframe_preview, font_size, text_align, sort_order) ",
        );
        qb.push_values(prepared_icons.iter(), |mut b, ic| {
            b.push_bind(ic.id)
                .push_bind(new_group.id)
                .push_bind(&ic.data.name)
                .push_bind(ic.data.url.as_deref())
                .push_bind(ic.data.sub.as_deref())
                .push_bind(ic.data.title.as_deref())
                .push_bind(ic.data.cta.as_deref())
                .push_bind(&ic.data.size)
                .push_bind(ic.data.letter.as_deref())
                .push_bind(ic.data.color)
                .push_bind(ic.data.image_url.as_deref())
                .push_bind(&ic.data.image_style)
                .push_bind(&ic.data.image_radius)
                .push_bind(ic.data.is_folder)
                .push_bind(ic.data.iframe_preview)
                .push_bind(&ic.data.font_size)
                .push_bind(&ic.data.text_align)
                .push_bind(ic.data.sort_order);
        });
        qb.build().execute(&mut *tx).await?;
    }

    if !prepared_folder_items.is_empty() {
        let mut qb = QueryBuilder::<Postgres>::new(
            "INSERT INTO folder_items (id, folder_icon_id, name, letter, color, url, image_url, image_style, image_radius, sort_order) ",
        );
        qb.push_values(prepared_folder_items.iter(), |mut b, item| {
            b.push_bind(Uuid::new_v4())
                .push_bind(item.folder_icon_id)
                .push_bind(&item.data.name)
                .push_bind(item.data.letter.as_deref())
                .push_bind(item.data.color)
                .push_bind(item.data.url.as_deref())
                .push_bind(item.data.image_url.as_deref())
                .push_bind(&item.data.image_style)
                .push_bind(&item.data.image_radius)
                .push_bind(item.data.sort_order);
        });
        qb.build().execute(&mut *tx).await?;
    }

    if !widgets.is_empty() {
        let mut qb = QueryBuilder::<Postgres>::new(
            "INSERT INTO widgets (id, group_id, widget_type, w_span, w_row, config, sort_order) ",
        );
        qb.push_values(widgets.iter(), |mut b, w| {
            b.push_bind(Uuid::new_v4())
                .push_bind(new_group.id)
                .push_bind(&w.widget)
                .push_bind(w.w_span)
                .push_bind(w.w_row)
                .push_bind(&w.config)
                .push_bind(w.sort_order);
        });
        qb.build().execute(&mut *tx).await?;
    }

    tx.commit().await?;

    util::audit(
        &state,
        Some(&user),
        "import_group",
        Some(group_name),
        "group",
        None,
    )
    .await;

    Ok((StatusCode::CREATED, Json(new_group)))
}

struct PreparedIcon {
    id: Uuid,
    data: IconExportData,
}

struct PreparedFolderItem {
    folder_icon_id: Uuid,
    data: FolderItemData,
}

async fn export_image_asset(
    state: &Arc<AppState>,
    image_url: Option<&str>,
) -> Option<ExportedAssetData> {
    let key = crate::storage::key_from_stored_value(image_url?)?;
    match state.storage.get_bytes(&key).await {
        Ok((bytes, content_type)) => {
            let digest = Sha256::digest(&bytes);
            Some(ExportedAssetData {
                data: BASE64_STANDARD.encode(&bytes),
                content_type,
                filename: key.rsplit('/').next().map(|s| s.to_string()),
                sha256: Some(hex::encode(digest)),
            })
        }
        Err(e) => {
            tracing::warn!("failed to embed exported icon asset '{}': {e}", key);
            None
        }
    }
}

async fn materialize_exported_asset(
    state: &Arc<AppState>,
    tx: &mut Transaction<'_, Postgres>,
    uploader_id: Option<Uuid>,
    asset: Option<&ExportedAssetData>,
    fallback_url: Option<String>,
    display_name: &str,
) -> AppResult<Option<String>> {
    let Some(asset) = asset else {
        return Ok(fallback_url);
    };
    let data = BASE64_STANDARD
        .decode(asset.data.trim())
        .map_err(|e| AppError::BadRequest(format!("invalid embedded icon asset: {e}")))?;
    let max_bytes = (state.cfg.app.upload_max_mb * 1024 * 1024) as usize;
    if data.len() > max_bytes {
        return Err(AppError::BadRequest(format!(
            "embedded icon asset too large ({} bytes > {} max)",
            data.len(),
            max_bytes
        )));
    }

    // DATA-9: 导出文档内嵌了资产的 sha256。导入时校验解码后的字节与之匹配,确保传输/
    // 篡改完整性;不匹配则拒绝整个导入(BadRequest),不落库/不写对象。校验值缺失时
    // 跳过(兼容不带 sha256 的旧格式)。
    if let Some(expected) = asset
        .sha256
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        if !util::verify_sha256(&data, expected) {
            return Err(AppError::BadRequest(format!(
                "embedded asset sha256 mismatch for '{display_name}' — corrupted or tampered payload"
            )));
        }
    }

    let content_type = detect_exported_asset_mime(&data, asset.content_type.as_deref())?;
    // SEC: 嗅探真实字节判定是否为 SVG,而非信任 content_type。否则攻击者用
    // contentType:"image/png" 包裹含 <script> 的 SVG 字节,detect_* 会因 hint 提前
    // 返回 image/png,使下面的扫描被跳过。无论 hint 为何,只要字节是 SVG 形态就扫描。
    if content_type == "image/svg+xml" || is_svg_bytes(&data) {
        util::scan_svg_for_active_content(&data)
            .map_err(|reason| AppError::BadRequest(format!("SVG rejected: {reason}")))?;
    }

    let mut hasher = Sha256::new();
    hasher.update(&data);
    let sha_hex = hex::encode(hasher.finalize());

    let existing =
        sqlx::query_scalar::<_, String>("SELECT url FROM library_icons WHERE sha256 = $1 LIMIT 1")
            .bind(&sha_hex)
            .fetch_optional(&mut **tx)
            .await?;
    if let Some(url) = existing {
        return Ok(Some(url));
    }

    let ext = exported_asset_ext(&content_type, asset.filename.as_deref());
    let storage_key = format!("icons/{sha_hex}.{ext}");
    let url = format!("/uploads/{storage_key}");
    state
        .storage
        .put_bytes(&storage_key, Some(&content_type), Bytes::from(data.clone()))
        .await?;

    sqlx::query(
        "INSERT INTO library_icons (sha256, name, url, uploader_id, size, content_type)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&sha_hex)
    .bind(display_name)
    .bind(&url)
    .bind(uploader_id)
    .bind(data.len() as i32)
    .bind(&content_type)
    .execute(&mut **tx)
    .await?;

    Ok(Some(url))
}

/// SEC: 仅凭字节判定是否为 SVG 形态(裁掉 BOM/前导空白后以 `<svg` 或
/// `<?xml ... <svg` 开头,或正文出现 `<svg`)。与 detect_exported_asset_mime 末段同义,
/// 抽出供主动内容扫描复用 —— 关键在于该判定不受调用方 content_type hint 影响。纯函数,可单测。
fn is_svg_bytes(bytes: &[u8]) -> bool {
    // 裁掉 UTF-8 BOM。
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let text = String::from_utf8_lossy(bytes);
    let trimmed = text.trim_start();
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("<svg") || lower.starts_with("<?xml") || lower.contains("<svg")
}

fn detect_exported_asset_mime(bytes: &[u8], hinted: Option<&str>) -> AppResult<String> {
    if let Some(ct) = hinted.map(str::trim).filter(|v| !v.is_empty()) {
        if ct.starts_with("image/") {
            return Ok(ct.to_string());
        }
    }
    if let Some(kind) = infer::get(bytes) {
        let mime = kind.mime_type();
        if mime.starts_with("image/") {
            return Ok(mime.to_string());
        }
    }
    if is_svg_bytes(bytes) {
        return Ok("image/svg+xml".to_string());
    }
    Err(AppError::BadRequest(
        "embedded icon asset must be an image".into(),
    ))
}

fn exported_asset_ext(content_type: &str, filename: Option<&str>) -> &'static str {
    if let Some(lower) = filename.map(|v| v.to_ascii_lowercase()) {
        if lower.ends_with(".svg") {
            return "svg";
        }
        if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
            return "jpg";
        }
        if lower.ends_with(".png") {
            return "png";
        }
        if lower.ends_with(".webp") {
            return "webp";
        }
        if lower.ends_with(".gif") {
            return "gif";
        }
        if lower.ends_with(".ico") {
            return "ico";
        }
    }
    match content_type {
        "image/svg+xml" => "svg",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        _ => "bin",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 真实 PNG 魔数(8 字节签名),不应被当作 SVG。
    const PNG_MAGIC: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    #[test]
    fn detects_svg_shaped_bytes() {
        assert!(is_svg_bytes(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"));
        assert!(is_svg_bytes(
            b"<?xml version=\"1.0\"?>\n<svg><script>alert(1)</script></svg>"
        ));
        // 前导空白 + 大写标签。
        assert!(is_svg_bytes(b"   \n\t<SVG></SVG>"));
        // BOM 前缀。
        let mut with_bom = vec![0xEF, 0xBB, 0xBF];
        with_bom.extend_from_slice(b"<svg></svg>");
        assert!(is_svg_bytes(&with_bom));
    }

    #[test]
    fn real_png_not_treated_as_svg() {
        assert!(!is_svg_bytes(PNG_MAGIC));
        let mut png = PNG_MAGIC.to_vec();
        png.extend_from_slice(&[0u8; 64]);
        assert!(!is_svg_bytes(&png));
        assert!(!is_svg_bytes(b"just plain text no markup"));
    }

    /// 复现核心攻击面:contentType:"image/png" 包裹含 <script> 的 SVG 字节。
    /// detect_* 因 hint 提前返回 image/png,但生产代码用 `|| is_svg_bytes(..)` 兜底,
    /// 仍会触发扫描并拒绝。本测试断言这条组合判定与扫描结果。
    #[test]
    fn png_hint_does_not_skip_svg_scan() {
        let svg_with_script = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>";

        // hint=image/png 时 detect 返回 image/png(被信任),单看它不会判为 svg。
        let detected =
            detect_exported_asset_mime(svg_with_script, Some("image/png")).unwrap();
        assert_eq!(detected, "image/png");

        // 但字节嗅探仍识别为 SVG,生产代码据此触发扫描。
        let should_scan = detected == "image/svg+xml" || is_svg_bytes(svg_with_script);
        assert!(should_scan, "svg-shaped bytes must be scanned despite png hint");

        // 扫描必须拒绝带 <script> 的内容。
        assert!(util::scan_svg_for_active_content(svg_with_script).is_err());
    }

    #[test]
    fn real_png_bytes_not_scanned_as_svg() {
        let mut png = PNG_MAGIC.to_vec();
        png.extend_from_slice(&[0u8; 64]);
        let detected = detect_exported_asset_mime(&png, Some("image/png")).unwrap();
        let should_scan = detected == "image/svg+xml" || is_svg_bytes(&png);
        assert!(!should_scan, "real png must not be scanned as svg");
    }
}
