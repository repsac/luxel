use serde::{Deserialize, Serialize};

/// Information about the selected GPU adapter.
///
/// All fields are optional because some platforms or backends may not report
/// every value. Missing values must degrade gracefully into the UI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GpuInfo {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub backend: Option<String>,
    #[serde(rename = "deviceType")]
    pub device_type: Option<String>,
    pub driver: Option<String>,
}

impl GpuInfo {
    pub fn display_name(&self) -> &str {
        self.name.as_deref().unwrap_or("Unknown GPU")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_round_trips() {
        let g = GpuInfo::default();
        let s = serde_json::to_string(&g).unwrap();
        let g2: GpuInfo = serde_json::from_str(&s).unwrap();
        assert_eq!(g, g2);
    }

    #[test]
    fn missing_name_falls_back() {
        let g = GpuInfo::default();
        assert_eq!(g.display_name(), "Unknown GPU");
    }
}
