# TRACKING_PLAN.md

> บันทึก events และ params ที่ยืนยันแล้วว่ามีข้อมูลจริงใน BigQuery

## Standard GA4 Events (ทุก app)

| Event | Params | สถานะ |
|---|---|---|
| `session_start` | `ga_session_id` (int) | ✅ GA4 auto |
| `first_open` | — | ✅ GA4 auto |

## Custom Events

| Event | Params | Type | สถานะ |
|---|---|---|---|
| `YOUR_EVENT` | `param_name` | int / string / float | 🔲 TODO |

<!-- เพิ่ม events ที่ยืนยันแล้วใน BQ ที่นี่ -->
