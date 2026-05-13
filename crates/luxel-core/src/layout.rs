use serde::{Deserialize, Serialize};

/// The view rendered inside a slot.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ViewId {
    Render,
    Editor,
    Console,
    Empty,
}

/// Identifies one of the three layout slots.
///
/// `TopLeft` and `TopRight` share the top row horizontally. `Bottom` is the
/// full-width row beneath them. Any slot can host any view, and any slot can
/// be hidden — combined with the `maximized` field this lets the user build
/// arbitrary configurations from a fixed three-slot skeleton.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum SlotId {
    TopLeft,
    TopRight,
    Bottom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct SlotState {
    pub view: ViewId,
    pub visible: bool,
}

impl SlotState {
    pub const fn new(view: ViewId) -> Self {
        Self { view, visible: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutSlots {
    #[serde(rename = "topLeft")]
    pub top_left: SlotState,
    #[serde(rename = "topRight")]
    pub top_right: SlotState,
    pub bottom: SlotState,
}

impl Default for LayoutSlots {
    fn default() -> Self {
        Self {
            top_left: SlotState::new(ViewId::Render),
            top_right: SlotState::new(ViewId::Editor),
            bottom: SlotState::new(ViewId::Console),
        }
    }
}

/// Sizes are fractional and stored separately from the slot assignment so the
/// user can swap a view in/out of a slot without losing the splitter positions.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct LayoutSizes {
    /// Fraction (0..1) of the total height taken by the bottom row.
    #[serde(rename = "bottomFraction")]
    pub bottom_fraction: f32,
    /// Fraction (0..1) of the top row's width taken by the left slot.
    /// The right slot takes 1 - top_left_fraction.
    #[serde(rename = "topLeftFraction")]
    pub top_left_fraction: f32,
}

impl Default for LayoutSizes {
    fn default() -> Self {
        Self {
            bottom_fraction: 0.25,
            top_left_fraction: 0.55,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutState {
    #[serde(default)]
    pub slots: LayoutSlots,
    #[serde(default)]
    pub sizes: LayoutSizes,
    /// If set, that slot fills the whole layout area until restored.
    #[serde(default)]
    pub maximized: Option<SlotId>,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            slots: LayoutSlots::default(),
            sizes: LayoutSizes::default(),
            maximized: None,
        }
    }
}

impl LayoutState {
    pub fn maximize(&mut self, slot: SlotId) {
        self.maximized = Some(slot);
    }
    pub fn restore(&mut self) {
        self.maximized = None;
    }
}

// Back-compat type aliases for any other code (or examples) that still
// references the v1 names.
pub type PanelState = SlotState;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_round_trip() {
        let l = LayoutState::default();
        let s = serde_json::to_string(&l).unwrap();
        let l2: LayoutState = serde_json::from_str(&s).unwrap();
        assert_eq!(l, l2);
    }

    #[test]
    fn maximize_restore() {
        let mut l = LayoutState::default();
        l.maximize(SlotId::TopLeft);
        assert_eq!(l.maximized, Some(SlotId::TopLeft));
        l.restore();
        assert_eq!(l.maximized, None);
    }

    #[test]
    fn view_id_serializes_lowercase() {
        let s = serde_json::to_string(&ViewId::Render).unwrap();
        assert_eq!(s, "\"render\"");
        let s = serde_json::to_string(&ViewId::Empty).unwrap();
        assert_eq!(s, "\"empty\"");
    }

    #[test]
    fn slot_id_serializes_camel_case() {
        assert_eq!(serde_json::to_string(&SlotId::TopLeft).unwrap(), "\"topLeft\"");
        assert_eq!(serde_json::to_string(&SlotId::TopRight).unwrap(), "\"topRight\"");
        assert_eq!(serde_json::to_string(&SlotId::Bottom).unwrap(), "\"bottom\"");
    }
}
