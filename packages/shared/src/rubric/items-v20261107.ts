import type { RubricGroup } from "../types";

/**
 * FROZEN snapshot of the item groups as released under rubric version "2026-11-07" (W56–W67:
 * 33 groups; roof access Available/Not available; "*" items as they were then). Generated from
 * items.ts before the 2026-11-11 changes (W68) and never edited again. Surveys stamped with that
 * version were scored against exactly these weights.
 */
export const RUBRIC_GROUPS_20261107: RubricGroup[] = [
  {
    "name": "Boundary wall",
    "category": "Safety",
    "weight": 7,
    "locations": [
      "External Development"
    ],
    "aggregation": "worst"
  },
  {
    "name": "Main Gate",
    "category": "Safety",
    "weight": 7,
    "locations": [
      "External Development"
    ],
    "aggregation": "worst"
  },
  {
    "name": "Access to roof area /tanks",
    "category": "Safety",
    "weight": 10,
    "locations": [
      "Roof"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "Roof Access Available"
      },
      {
        "condition": "Very Poor",
        "label": "Roof Access Not Available"
      }
    ],
    "hideNA": true,
    "aggregation": "worst"
  },
  {
    "name": "Concrete/Plaster Soundness",
    "category": "Safety",
    "weight": 12,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Exterior Facade",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen",
      "UGWT"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "guidance": "Tap with a hammer and listen for a hollow sound (to detect delamination effect). Mark Unsafe if a hollow sound is heard.",
    "aggregation": "worst"
  },
  {
    "name": "Ceiling Condition i.e. cracks & seepage",
    "category": "Safety",
    "weight": 16,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen",
      "UGWT"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "aggregation": "worst"
  },
  {
    "name": "Wall/Column Condition i.e. cracks",
    "category": "Safety",
    "weight": 10,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Exterior Facade",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen",
      "UGWT"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "unsafeParts": [
      "Column",
      "Wall"
    ],
    "guidance": "Consider minor surface cracks (one sided, crazing, shrinkage, hairline cracks) in plaster item rating.",
    "aggregation": "worst"
  },
  {
    "name": "Roof Screeding/roof drainage",
    "category": "Safety",
    "weight": 10,
    "locations": [
      "Roof"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "aggregation": "worst"
  },
  {
    "name": "Window Shades",
    "label": "Window Shades (Chajja)",
    "category": "Safety",
    "weight": 7,
    "locations": [
      "Exterior Facade"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "aggregation": "worst"
  },
  {
    "name": "Slab + Screeding/Waterproofing thickness assessment",
    "category": "Safety",
    "weight": 10,
    "locations": [
      "Roof"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "OK"
      },
      {
        "condition": "Very Poor",
        "label": "Unsafe"
      }
    ],
    "derived": true,
    "aggregation": "worst"
  },
  {
    "name": "Proper Overflow Disposal System",
    "category": "Safety",
    "weight": 4,
    "locations": [
      "Roof"
    ],
    "conditionOverride": [
      {
        "condition": "Good",
        "label": "YES"
      },
      {
        "condition": "Very Poor",
        "label": "NO"
      }
    ],
    "derived": true,
    "aggregation": "worst"
  },
  {
    "name": "Distribution Board",
    "category": "Safety",
    "weight": 7,
    "locations": [
      "Corridor & Stairs",
      "Guardroom"
    ],
    "aggregation": "worst"
  },
  {
    "name": "Green board/Softboard/Cabinet",
    "category": "Functionality",
    "weight": 10,
    "principalMaintained": true,
    "locations": [
      "Classroom",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Canteen & UGWT"
    ],
    "aggregation": "average"
  },
  {
    "name": "Water Storage (Overhead Tank)",
    "category": "Functionality",
    "weight": 8,
    "principalMaintained": true,
    "locations": [
      "Roof"
    ],
    "aggregation": "average"
  },
  {
    "name": "External Plumbing",
    "category": "Functionality",
    "weight": 8,
    "principalMaintained": true,
    "locations": [
      "Exterior Facade",
      "Roof",
      "UGWT"
    ],
    "aggregation": "average"
  },
  {
    "name": "Wash Basin/Taps",
    "category": "Functionality",
    "weight": 8,
    "principalMaintained": true,
    "locations": [
      "Toilet",
      "Lab (Wet/Dry/DLP)",
      "Guardroom"
    ],
    "aggregation": "average"
  },
  {
    "name": "Flush Tanks",
    "category": "Functionality",
    "weight": 7,
    "principalMaintained": true,
    "locations": [
      "Toilet",
      "Guardroom"
    ],
    "aggregation": "average"
  },
  {
    "name": "Sewerage System",
    "category": "Functionality",
    "weight": 8,
    "principalMaintained": true,
    "locations": [
      "Toilet",
      "Exterior Facade",
      "Lab (Wet/Dry/DLP)",
      "Guardroom"
    ],
    "aggregation": "average"
  },
  {
    "name": "Electrical Fixtures + Switch/Dimmer Sheet",
    "category": "Functionality",
    "weight": 5,
    "principalMaintained": true,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen"
    ],
    "aggregation": "average"
  },
  {
    "name": "Drinking Water Cooler & Filter",
    "category": "Functionality",
    "weight": 4,
    "principalMaintained": true,
    "locations": [
      "Corridor & Stairs"
    ],
    "aggregation": "average"
  },
  {
    "name": "Motor (Water pump)",
    "category": "Functionality",
    "weight": 4,
    "principalMaintained": true,
    "locations": [
      "External Development"
    ],
    "aggregation": "average"
  },
  {
    "name": "Internal Flooring condition",
    "category": "Functionality",
    "weight": 7,
    "locations": [
      "Classroom",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Canteen & UGWT",
      "Canteen"
    ],
    "aggregation": "average"
  },
  {
    "name": "Furniture Condition",
    "category": "Functionality",
    "weight": 6,
    "principalMaintained": true,
    "locations": [
      "Classroom",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Canteen & UGWT",
      "Canteen"
    ],
    "aggregation": "average"
  },
  {
    "name": "Grill Gate",
    "category": "Functionality",
    "weight": 5,
    "principalMaintained": true,
    "locations": [
      "Corridor & Stairs",
      "Lab (Wet/Dry/DLP)",
      "Roof"
    ],
    "aggregation": "average"
  },
  {
    "name": "Door/Windows/Ventilators",
    "category": "Functionality",
    "weight": 10,
    "principalMaintained": true,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Exterior Facade",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen"
    ],
    "aggregation": "average"
  },
  {
    "name": "LED/TV/UPS",
    "category": "Functionality",
    "weight": 5,
    "principalMaintained": true,
    "locations": [
      "Lab (Wet/Dry/DLP)"
    ],
    "aggregation": "average"
  },
  {
    "name": "Solar Panels/Inverter/Batteries",
    "category": "Functionality",
    "weight": 5,
    "locations": [
      "Corridor & Stairs",
      "Roof"
    ],
    "locationLabels": {
      "Roof": "Solar Panels",
      "Corridor & Stairs": "Inverter/Batteries"
    },
    "aggregation": "average"
  },
  {
    "name": "Paint",
    "category": "Aesthetics",
    "weight": 35,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen"
    ],
    "aggregation": "average"
  },
  {
    "name": "Exterior Finish",
    "category": "Aesthetics",
    "weight": 25,
    "locations": [
      "Exterior Facade"
    ],
    "aggregation": "average"
  },
  {
    "name": "Toilet Flooring/tiles",
    "category": "Aesthetics",
    "weight": 7,
    "locations": [
      "Toilet",
      "Guardroom"
    ],
    "aggregation": "average"
  },
  {
    "name": "Signage",
    "category": "Aesthetics",
    "weight": 12,
    "principalMaintained": true,
    "locations": [
      "Exterior Facade"
    ],
    "aggregation": "average"
  },
  {
    "name": "Plaster",
    "category": "Aesthetics",
    "weight": 8,
    "locations": [
      "Classroom",
      "Toilet",
      "Corridor & Stairs",
      "Roof",
      "Other Room (Staff, Principal, Admin, Store etc.)",
      "Lab (Wet/Dry/DLP)",
      "Guardroom",
      "Canteen & UGWT",
      "Canteen",
      "UGWT"
    ],
    "aggregation": "average"
  },
  {
    "name": "Masonry",
    "category": "Aesthetics",
    "weight": 4,
    "locations": [
      "Exterior Facade",
      "Roof"
    ],
    "aggregation": "average"
  },
  {
    "name": "CC Jali",
    "category": "Aesthetics",
    "weight": 9,
    "locations": [
      "Corridor & Stairs",
      "Exterior Facade"
    ],
    "aggregation": "average"
  }
];
