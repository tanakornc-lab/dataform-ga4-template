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
| Default Location | `asia-southeast1` ← แก้ใน `workflow_settings.yaml` ถ้า BQ project อยู่ region อื่น |
| Timezone | `Asia/Bangkok` ← แก้ถ้าต่างกัน |

---

## Setup Checklist (AI: ทำตามลำดับนี้เมื่อตั้งโปรเจกใหม่)

### Step 0 — ตรวจสอบ GA4 → BigQuery Export
> ⚠️ **AI ทำขั้นนี้แทนไม่ได้ — แจ้ง user ให้ตรวจสอบเองและ confirm ก่อนไปขั้นถัดไป**

ถามว่า user เปิด GA4 → BigQuery export แล้วหรือยัง:
- **ถ้ายังไม่ได้เปิด:** แจ้งให้ไปที่ Firebase Console → Project Settings → Integrations → BigQuery → Link แล้วรอ 24 ชั่วโมงก่อน dataset จะปรากฏใน BigQuery — **หยุดรอก่อนทำขั้นถัดไป**
- **ถ้าเปิดแล้ว:** ให้ user ยืนยัน dataset name เช่น `analytics_551585329` แล้วไปขั้นถัดไปได้เลย

### Step 1 — แก้ `workflow_settings.yaml`
```yaml
defaultProject: YOUR_BQ_PROJECT        # ← ใส่ BQ project จริง
vars:
  ga4_dataset: PROJECT.analytics_XXXXX # ← ใส่ dataset จาก GA4 BigQuery export
  app_name: YOUR_APP_NAME              # ← ชื่อ app
```

### Step 2 — ค้นหา events จริงใน BQ
> ⚠️ **AI รัน BQ query แทนไม่ได้ — ส่ง query ด้านล่างให้ user รันใน BigQuery Console แล้วให้ user วาง (paste) ผลลัพธ์กลับมาที่นี่**

```sql
SELECT DISTINCT event_name, COUNT(*) AS cnt
FROM `YOUR_BQ_PROJECT.analytics_XXXXX.events_*`
WHERE REGEXP_CONTAINS(_TABLE_SUFFIX, r'^\d{8}$')
  AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
GROUP BY 1
ORDER BY 2 DESC
```

รอ user paste ผลลัพธ์มาก่อน จึงไปขั้นถัดไป

### Step 3 — ค้นหา params ของแต่ละ event
> ⚠️ **AI รัน BQ query แทนไม่ได้ — ส่ง query ด้านล่างให้ user รันใน BigQuery Console (แก้ `YOUR_EVENT_NAME` เป็น event ที่ต้องการ) แล้วให้ user วาง (paste) ผลลัพธ์กลับมาที่นี่**

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
> ดูจากผลลัพธ์ว่าแต่ละ param เก็บใน `int_value`, `double_value`, หรือ `string_value` ก่อนเขียน stg
> รอ user paste ผลลัพธ์ทุก event ที่ต้องการมาก่อน จึงไปขั้นถัดไป

**หลัง query เสร็จ: บันทึก events + params ที่ยืนยันแล้วลงใน `TRACKING_PLAN.md` ทันที**

### Step 4 — สร้าง Service Account สำหรับ Dataform

> **แนะนำทำเสมอ ไม่ว่าจะใช้ personal account หรือ org** — ถ้าข้ามและ error: "Service account must be set when strict act as checks are enabled" จะต้องกลับมาทำทีหลังแล้ว reconnect ใหม่ทั้งหมด ทำก่อนประหยัดเวลากว่ามาก

```bash
# สร้าง SA
gcloud iam service-accounts create sa-dataform-runner-prod \
  --project=YOUR_BQ_PROJECT \
  --display-name="Dataform Runner (prod)"

# Grant BigQuery roles
gcloud projects add-iam-policy-binding YOUR_BQ_PROJECT \
  --member="serviceAccount:sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding YOUR_BQ_PROJECT \
  --member="serviceAccount:sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# Grant user act-as SA นี้ได้
gcloud iam service-accounts add-iam-policy-binding \
  sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/iam.serviceAccountUser"
```

ถ้ามี Secret Manager → เพิ่ม `roles/secretmanager.secretAccessor` ให้ SA ด้วย

> **Race condition:** ถ้า grant roles แล้วได้ error "Service account does not exist" — รอ 10–15 วินาทีแล้วรัน command เดิมซ้ำ (IAM propagation ยังไม่เสร็จ)

### Step 5 — เชื่อม Dataform กับ GitHub repo
> ⚠️ **AI ทำขั้นนี้แทนไม่ได้ — แจ้ง user ให้ทำใน Dataform Console แล้วรอ confirm ก่อนไปขั้นถัดไป**

- เปิด [console.cloud.google.com](https://console.cloud.google.com) → ค้นหา **Dataform** → เลือก project
- สร้าง Repository → Connect to GitHub → เลือก repo นี้
- Workspace Settings → Authentication → เลือก SA `sa-dataform-runner-prod`

### Step 6 — เขียน stg_* สำหรับ events ของ app
- copy `stg_custom_events.sqlx` → ตั้งชื่อตาม event group
- ดู param types จาก Step 3 แล้วใส่ extraction ที่ถูกต้อง
- **float params → ใช้ `COALESCE(value.double_value, value.float_value, CAST(value.int_value AS FLOAT64))` เสมอ**

### Step 7 — เขียน int_* และ mart_*
- copy `int_custom_kpis.sqlx` และ `mart_custom_daily.sqlx`
- แก้ตาม business logic ของ app

### Step 8 — Compile + Full Refresh ใน Dataform workspace
> ⚠️ **AI ทำขั้นนี้แทนไม่ได้ — แจ้ง user ให้ทำใน Dataform workspace แล้วรอ confirm ก่อนไปขั้นถัดไป**

- เข้า workspace แล้วกด **Pull** (หรือ **Fetch and pull**) ก่อนเสมอ — เพื่อ sync code ที่ merge เข้า GitHub มาแล้วให้ workspace เห็น
- กด **Compile** — ถ้ามี error แจ้ง user พร้อม error message แล้วแก้ก่อน
- กด **Start Execution** → เลือก **Full Refresh** — รอจน status เป็น Succeeded

### Step 9 — ตั้ง Workflow Scheduler
> ⚠️ **AI ทำขั้นนี้แทนไม่ได้ — แจ้ง user ให้ทำใน Dataform Console**

- Release config: Daily **11:00 AM ICT**, branch `main`
- Workflow config: Daily **11:30 AM ICT**, SA: `sa-dataform-runner-prod`
- ห้ามตั้งก่อน 10:00 AM — GA4 export finalize ประมาณ 09-10 AM ICT ถ้าตั้งก่อนนั้น mart จะได้ข้อมูลช้าไป 2 วัน (T-2)

> **Timezone ใน Dataform Console:** ถ้า UI มี timezone picker → เลือก **Asia/Bangkok** ได้เลย  
> ถ้า UI ใช้ UTC → ตั้ง **04:00 UTC** (Release) และ **04:30 UTC** (Workflow) — เท่ากับ 11:00/11:30 AM ICT

### Step 10 — เชื่อม Looker Studio กับ analytics_mart
> ⚠️ **AI ทำขั้นนี้แทนไม่ได้ — แจ้ง user ให้ทำใน Looker Studio แล้วรอ confirm ก่อนจบ setup**

ก่อนทำขั้นนี้ต้องมีข้อมูลใน mart tables แล้ว — **หลัง Full Refresh ใน Step 8 เสร็จแล้ว เชื่อมได้ทันที** (ไม่ต้องรอ Scheduler — Scheduler เป็นแค่การ refresh อัตโนมัติรายวัน)

**วิธีเชื่อม:**
1. เปิด [Looker Studio](https://lookerstudio.google.com) → สร้าง Report ใหม่
2. เลือก Data Source → **BigQuery**
3. เลือก Project → dataset **`analytics_mart`** → เลือก table ที่ต้องการ (เริ่มจาก `mart_core_daily`)
4. กด **Connect** → **Add to Report**

**Charts พื้นฐานที่แนะนำ:**
- **DAU Trend** — Time series chart: Dimension = `event_date`, Metric = `dau`
- **New Users by Country** — Bar chart: Dimension = `country`, Metric = `new_users`
- **Retention Heatmap** — Cross tab / Pivot: Row = `cohort_date`, Column = `day_n`, Value = `retention_pct` (ใช้ `mart_retention_daily`)

**Data Sources แยกกัน:** ถ้าต้องการใช้ทั้ง `mart_core_daily` และ `mart_retention_daily` ใน report เดียว ให้เพิ่ม Data Source หลายตัว (Add data → BigQuery → เลือก table ที่สอง)

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
# หลัง user merge PR กลับมาแล้ว:
git pull                               # sync local ก่อนเสมอ ป้องกัน conflict ครั้งถัดไป
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
