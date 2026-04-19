use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Superadmin,
    Admin,
    User,
    Guest,
}

impl Role {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Superadmin => "superadmin",
            Role::Admin => "admin",
            Role::User => "user",
            Role::Guest => "guest",
        }
    }
    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "superadmin" => Role::Superadmin,
            "admin" => Role::Admin,
            "user" => Role::User,
            "guest" => Role::Guest,
            _ => return None,
        })
    }
    pub fn at_least_admin(&self) -> bool {
        matches!(self, Role::Admin | Role::Superadmin)
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    #[serde(skip)]
    pub password_hash: Option<String>,
    pub casdoor_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    #[sqlx(default)]
    pub must_change_password: bool,
}

impl User {
    pub fn role_enum(&self) -> Role {
        Role::from_str(&self.role).unwrap_or(Role::Guest)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionUser {
    pub id: Uuid,
    pub role: Role,
    pub username: String,
    pub email: String,
}
