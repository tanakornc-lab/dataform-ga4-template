# CLAUDE.md — Dataform GA4 Template

> **คู่มือนี้สำหรับ AI** — อ่านทั้งหมดก่อนเริ่มงานทุกครั้ง ทำตาม checklist ตามลำดับ อย่าข้ามขั้น

---

## กฎบังคับ (ห้ามละเมิดทุกกรณี)

1. **ทุกการเปลี่ยนแปลงต้องใช้ branch + PR เท่านั้น — ห้าม push ตรง main**
2. **ห้าม merge PR เอง — แจ้ง user ให้ merge และ pull กลับมาเอง**
3. **BigQuery: SELECT เท่านั้นผ่าน Dataform — ห้าม CREATE, INSERT, UPDATE, DELETE, DROP โดยตรง**

---

## โครงสร้างโปรเจก

| Field | Value |
|---|---|
| BQ Project | `YOUR_BQ_PROJECT` ← แก้ใน `workflow_settings.yaml` |
| GA4 Property ID | `YOUR_PROPERTY_ID` ← แก้ใน `workflow_settings.yaml` |
| Default Location | `asia-southeast1` |
| Timezone | `Asia/Bangkok` |

---

## Setup Checklist (AI: ทำตามลำดับนี้เมื่อตั้งโปรเจกใหม่)

### Step 1 — แก้ `workflow_settings.yaml`
```yaml
defaultProject: YOUR_BQ_PROJECT        # ← ใส่ BQ project จริง
vars:
  ga4_dataset: PROJECT.analytics_XXXXX # ← ใส่ dataset จาก GA4 BigQuery export
  app_name: YOUR_APP_NAME              # ← ชื่อ app
```

### Step 2 — ค้นหา events จริงใน BQ
```sql
SELECT DISTINCT event_name, COUNT(*) AS cnt
FROM `YOUR_BQ_PROJECT.analytics_XXXXX.events_*`
WHERE REGEXP_CONTAINS(_TABLE_SUFFIX, r'^\d{8}$')
  AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
GROUP BY 1
ORDER BY 2 DESC
```

### Step 3 — ค้นหา params ของแต่ละ event
```sql
SELECT ep.key, ep.value.int_value, ep.value.float_value,
       ep.value.double_value, ep.value.string_value,
       COUNT(*) AS cnt
FROM `YOUR_BQ_PROJECT.analytics_XXXXX.events_*`,
UNNEST(event_params) AS ep
WHERE event_name = 'YOUR_EVENT_NAME'
  AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^\d{8}$')
  AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
GROUP BY 1, 2, 3, 4, 5
ORDER BY cnt DESC
LIMIT 50
```
> ดูว่าแต่ละ param เก็บใน `int_value`, `double_value`, หรือ `string_value` ก่อนเขียน stg

### Step 4 — เชื่อม Dataform กับ GitHub repo
- ทำใน Dataform Console: Settings → Repository → Connect to GitHub

### Step 5 — เขียน stg_* สำหรับ events ของ app
- copy `stg_custom_events.sqlx` → ตั้งชื่อตาม event group
- ดู pattern ใน Step 3 แล้วใส่ param extraction ที่ถูกต้อง

### Step 6 — เขียน int_* และ mart_*
- copy `int_custom_kpis.sqlx` และ `mart_custom_daily.sqlx`
- แก้ตาม business logic ของ app

### Step 7 — Compile + Full Refresh ใน Dataform workspace
- Compile ก่อนเสมอเพื่อ catch syntax error
- รัน Full Refresh ครั้งแรกเพื่อ backfill ข้อมูล 90 วัน

### Step 8 — ตั้ง Workflow Scheduler
- Release config: Daily 11:00 AM ICT (หรือหลังจากนั้น), branch `main`
- Workflow config: Daily 11:30 AM ICT
- ห้ามตั้งก่อน 10:00 AM — GA4 export finalize ประมาณ 09-10 AM ICT

---

## โครงสร้างไฟล์

```
CLAUDE.md                    ← คู่มือ AI (ไฟล์นี้)
SETUP.md                     ← คู่มือคน
TRACKING_PLAN.md             ← events + params ที่ยืนยันแล้ว
WORKLOG.md                   ← ประวัติการทำงานรายวัน
workflow_settings.yaml        ← Dataform config
includes/utils.js             ← surrogate_key() helper
.sqlfluff                     ← SQL linter
.github/workflows/            ← CI: lint + compile
definitions/
  staging/   stg_*           ← Views: clean + extract จาก raw GA4
  transform/ int_*           ← Views: aggregate / business logic
  mart/      mart_*          ← Incremental tables: final output
```

---

## Pipeline Architecture

```
GA4 BigQuery Export (events_*)
    ↓
[staging]   stg_*  — row-level clean, extract event_params, debug filter, no JOIN
    ↓
[transform] int_*  — aggregate, business logic, user-level dedup, cohort anchor
    ↓
[mart]      mart_* — incremental MERGE, partition + cluster, BI/agent layer
```

**Ready-to-use (ไม่ต้องแก้):**
- `stg_core_events` + `int_core_kpis` + `mart_core_daily` → DAU, new users, sessions
- `int_retention_kpis` + `mart_retention_daily` → D0–D30 cohort retention heatmap

**ต้องเขียนเพิ่มตาม app:**
- `stg_<name>_events` + `int_<name>_kpis` + `mart_<name>_daily` ต่อ 1 event group

---

## Naming Convention

| Layer | Prefix | Schema |
|---|---|---|
| Staging | `stg_` | `analytics_staging` |
| Transform | `int_` | `analytics_transform` |
| Mart | `mart_` | `analytics_mart` |

- ทุก table, column, variable ใช้ `snake_case`
- ชื่อ mart ลงท้ายด้วย `_daily` เสมอ (partition by date)

---

## SQL Standards

### event_params extraction
```sql
-- int:    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'name')
-- string: (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'name')
-- float:  (SELECT COALESCE(value.double_value, value.float_value, CAST(value.int_value AS FLOAT64))
--          FROM UNNEST(event_params) WHERE key = 'name')
```
> Firebase SDK เก็บ float params ใน `double_value` เสมอ — ใช้ COALESCE ทุกครั้ง

### Debug filter (ทุก staging file บน GA4)
```sql
AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'debug_mode') IS DISTINCT FROM 1
```

### Intraday filter (กรอง events_intraday_* ออก)
```sql
AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^\d{8}$')
```

### Standard dimensions
```sql
COALESCE(geo.country, '(not set)')              AS country
COALESCE(device.operating_system, '(not set)')  AS os
```

### NULL policy
| Column type | Default |
|---|---|
| `country`, `os` | `COALESCE(…, '(not set)')` — never NULL |
| Count metrics | `COALESCE(…, 0)` |
| Rate / average | `NULL` (NULL ≠ 0) |

### Incremental pattern (mart)
```sql
${when(incremental(),
    `event_date >= DATE_SUB(CURRENT_DATE('${dataform.projectConfig.vars.timezone}'), INTERVAL 3 DAY)`,
    `event_date >= DATE_SUB(CURRENT_DATE('${dataform.projectConfig.vars.timezone}'), INTERVAL 90 DAY)`
)}
```

### Mart config template
```js
config {
    type: "incremental",
    schema: "analytics_mart",
    uniqueKey: ["event_date", "country", "os"],
    bigquery: {
        partitionBy: "event_date",
        clusterBy: ["country", "os"]
    },
    assertions: { nonNull: ["event_date", "country", "os"] }
}
```

### GA4 table reference — ต้องครอบ backtick เสมอ
```sql
FROM `${dataform.projectConfig.vars.ga4_dataset}.events_*`
```
> project name ที่มีขีดกลาง (เช่น `my-app-dev`) ทำให้ BigQuery parse ผิดถ้าไม่มี backtick

---

## Retention Pattern

`mart_retention_daily` ใช้ **long format** (cohort_date × day_n):
- `cohort_date` = วันที่ `first_open` ครั้งแรกของ user
- `day_n` = 0–30 (exact day, ไม่ใช่ cumulative)
- `retained_users` = NULL ถ้า cohort อายุยังไม่ถึง day_n (Maturity Guard)
- `retention_pct` = retained_users / cohort_size

---

## Git Workflow

```bash
git checkout -b <type>/<description>   # สร้าง branch เสมอ
# แก้ไขไฟล์
git add <files>
git commit -m "type: description"
git push -u origin <branch>
gh pr create ...
# แจ้ง user merge — ห้าม merge เอง
```

**Commit types:** `feat:` `fix:` `docs:` `refactor:`

---

## WORKLOG

อัปเดตทุกครั้งที่จบ session:
```
## [YYYY-MM-DD] — <ชื่องาน>
- **ทำโดย:** <ชื่อ>
- **เสร็จ:** <สิ่งที่ทำ + ชื่อไฟล์>
- **ค้าง:** <งานที่ยังไม่จบ>
- **ตัดสินใจ:** <การตัดสินใจสำคัญ + เหตุผล>
- **ระวัง:** <สิ่งที่ session ถัดไปต้องรู้>
```
