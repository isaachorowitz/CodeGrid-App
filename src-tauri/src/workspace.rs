use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub layout_json: Option<String>,
    pub created_at: String,
    pub is_active: bool,
}

impl Workspace {
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            layout_json: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            is_active: false,
        }
    }
}
