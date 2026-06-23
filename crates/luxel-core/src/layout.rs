use serde::{Deserialize, Serialize};

/// The view rendered inside a slot.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ViewId {
    Render,
    Editor,
    Console,
    Inspector,
    Scratchpad,
    Empty,
}

/// Top-level layout geometry. Each shape defines a fixed number of slots and
/// how they pack inside the main area. Slots themselves are anonymous
/// (indexed 0/1/2) and get their visual position from the shape.
///
/// `Single`           → [0]
/// `TwoAcross`        → [0] | [1]
/// `TwoTopOneBottom`  → top row [0] | [1] / bottom [2]
/// `OneTopTwoBottom`  → top [0] / bottom row [1] | [2]
/// `OneLeftTwoRight`  → left [0] | right column [1] / [2]
/// `TwoLeftOneRight`  → left column [0] / [1] | right [2]
/// `ThreeAcross`      → [0] | [1] | [2]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LayoutShape {
    Single,
    TwoAcross,
    TwoTopOneBottom,
    OneTopTwoBottom,
    OneLeftTwoRight,
    TwoLeftOneRight,
    ThreeAcross,
    TwoByTwo,
}

impl LayoutShape {
    /// Number of slots this shape places.
    pub const fn slot_count(self) -> usize {
        match self {
            LayoutShape::Single => 1,
            LayoutShape::TwoAcross => 2,
            LayoutShape::TwoTopOneBottom
            | LayoutShape::OneTopTwoBottom
            | LayoutShape::OneLeftTwoRight
            | LayoutShape::TwoLeftOneRight
            | LayoutShape::ThreeAcross => 3,
            LayoutShape::TwoByTwo => 4,
        }
    }
}

impl Default for LayoutShape {
    fn default() -> Self {
        LayoutShape::TwoTopOneBottom
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct SlotState {
    pub view: ViewId,
}

impl SlotState {
    pub const fn new(view: ViewId) -> Self {
        Self { view }
    }
}

/// Splitter positions, expressed as fractions in [0, 1] of the relevant axis.
///
/// Meaning depends on shape:
///   * `primary` is the outer split (left vs right, or top vs bottom).
///   * `secondary` is the inner split inside the multi-pane half of the shape.
///     For three-across it's the split between the second and third panes
///     (within the area after `primary`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct LayoutSizes {
    pub primary: f32,
    pub secondary: f32,
}

impl Default for LayoutSizes {
    fn default() -> Self {
        Self {
            primary: 0.7,
            secondary: 0.55,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutState {
    #[serde(default)]
    pub shape: LayoutShape,
    #[serde(default = "default_slots_for_balanced")]
    pub slots: Vec<SlotState>,
    #[serde(default)]
    pub sizes: LayoutSizes,
    /// Index into `slots`; when `Some`, that slot fills the whole layout area.
    #[serde(default)]
    pub maximized: Option<usize>,
}

fn default_slots_for_balanced() -> Vec<SlotState> {
    vec![
        SlotState::new(ViewId::Render),
        SlotState::new(ViewId::Editor),
        SlotState::new(ViewId::Console),
    ]
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            shape: LayoutShape::TwoTopOneBottom,
            slots: default_slots_for_balanced(),
            sizes: LayoutSizes::default(),
            maximized: None,
        }
    }
}

impl LayoutState {
    pub fn maximize(&mut self, slot: usize) {
        if slot < self.slots.len() {
            self.maximized = Some(slot);
        }
    }
    pub fn restore(&mut self) {
        self.maximized = None;
    }
}

// Back-compat type alias for any other code that still references the older name.
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
        l.maximize(0);
        assert_eq!(l.maximized, Some(0));
        l.restore();
        assert_eq!(l.maximized, None);
    }

    #[test]
    fn maximize_out_of_range_is_noop() {
        let mut l = LayoutState::default();
        l.maximize(99);
        assert_eq!(l.maximized, None);
    }

    #[test]
    fn view_id_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&ViewId::Render).unwrap(), "\"render\"");
        assert_eq!(serde_json::to_string(&ViewId::Empty).unwrap(), "\"empty\"");
    }

    #[test]
    fn shape_slot_counts() {
        assert_eq!(LayoutShape::Single.slot_count(), 1);
        assert_eq!(LayoutShape::TwoAcross.slot_count(), 2);
        assert_eq!(LayoutShape::TwoTopOneBottom.slot_count(), 3);
        assert_eq!(LayoutShape::ThreeAcross.slot_count(), 3);
    }
}
