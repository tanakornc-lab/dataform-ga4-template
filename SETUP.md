# SETUP.md — คู่มือตั้งค่าสำหรับโปรเจกใหม่

> คู่มือนี้สำหรับ**คน** — ถ้าให้ AI ทำ ให้แนบ CLAUDE.md แทน

---

## Prerequisites

- [ ] Google Cloud project พร้อม billing
- [ ] GitHub account
- [ ] `gcloud` CLI ติดตั้งแล้วและ login แล้ว

---

## Step 0 — เปิด GA4 → BigQuery Export

ตรวจสอบว่ามี dataset ที่ขึ้นต้นด้วย `analytics_` ใน BigQuery Console หรือยัง

**ถ้ายังไม่มี:** ไปที่ Firebase Console → Project Settings → Integrations → BigQuery → **Link** → เลือก BQ project → Enable  
**⚠️ รอ 24 ชั่วโมง** ก่อน dataset จะปรากฏใน BigQuery แล้วค่อยไปขั้นถัดไป

**ถ้ามีแล้ว:** จด dataset name ไว้ เช่น `analytics_551585329` แล้วไปขั้นถัดไปได้เลย

---

## Step 1 — Fork / Use as Template

กด **Use this template** บน GitHub → สร้าง repo ใหม่ชื่อ `<your-app>-dataform`

---

## Step 2 — แก้ workflow_settings.yaml

```yaml
defaultProject: YOUR_BQ_PROJECT          # เช่น my-app-prod
defaultLocation: asia-southeast1          # แก้ถ้า project อยู่ region อื่น
vars:
  timezone: Asia/Bangkok                  # แก้ถ้า timezone ต่างกัน
  ga4_dataset: PROJECT.analytics_XXXXX   # dataset จาก GA4 BigQuery export
  app_name: YOUR_APP_NAME
```

หา `analytics_XXXXX` ได้จาก BigQuery Console → ดู dataset ที่ขึ้นต้นด้วย `analytics_`

---

## Step 3 — สร้าง Service Account

```bash
# สร้าง SA
gcloud iam service-accounts create sa-dataform-runner-prod \
  --project=YOUR_BQ_PROJECT \
  --display-name="Dataform Runner (prod)"

# Grant roles
gcloud projects add-iam-policy-binding YOUR_BQ_PROJECT \
  --member="serviceAccount:sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding YOUR_BQ_PROJECT \
  --member="serviceAccount:sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# Grant ให้ user ของคุณ act-as SA นี้ได้
gcloud iam service-accounts add-iam-policy-binding \
  sa-dataform-runner-prod@YOUR_BQ_PROJECT.iam.gserviceaccount.com \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/iam.serviceAccountUser"
```

> **ทำไมต้องทำ?** องค์กรที่เปิด `strict act-as checks` จะ error ถ้าไม่มี SA นี้

---

## Step 4 — เชื่อม Dataform กับ GitHub

1. เปิด Dataform Console ใน GCP
2. สร้าง Repository ใหม่ → เลือก GitHub → เชื่อมกับ repo ที่ fork มา
3. ใน Workspace Settings → เลือก SA `sa-dataform-runner-prod`

---

## Step 5 — ดู Events จริงใน BigQuery

```sql
SELECT DISTINCT event_name, COUNT(*) AS cnt
FROM `YOUR_BQ_PROJECT.analytics_XXXXX.events_*`
WHERE REGEXP_CONTAINS(_TABLE_SUFFIX, r'^\d{8}$')
  AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
GROUP BY 1 ORDER BY 2 DESC
```

จดไว้ใน `TRACKING_PLAN.md`

---

## Step 6 — เขียน Pipeline ของ App

สำหรับแต่ละ event group:
1. copy `definitions/staging/stg_custom_events.sqlx` → แก้ตาม events ที่มี
2. copy `definitions/transform/int_custom_kpis.sqlx` → เขียน metrics
3. copy `definitions/mart/mart_custom_daily.sqlx` → final table

---

## Step 7 — Compile + Full Refresh

ใน Dataform workspace:
1. กด **Compile** — ต้องไม่มี error
2. กด **Start Execution** → เลือก **Full Refresh**

---

## Step 8 — ตั้ง Scheduler

ใน Dataform Console → Release configurations:
- **Release config**: Daily 11:00 AM ICT, branch `main`
- **Workflow config**: Daily 11:30 AM ICT, SA: `sa-dataform-runner-prod`

> ห้ามตั้งก่อน 10:00 AM — GA4 export finalize ประมาณ 09-10 AM ICT  
> ตั้งก่อนเวลา = mart ได้ข้อมูลช้าไป 2 วัน (T-2 แทน T-1)

---

## Step 9 — เชื่อม Looker Studio

หลังจาก Scheduler รันอย่างน้อย 1 ครั้งและมีข้อมูลใน `analytics_mart` แล้ว:

1. เปิด [Looker Studio](https://lookerstudio.google.com) → สร้าง Report ใหม่
2. Add Data → **BigQuery** → เลือก Project → dataset **`analytics_mart`** → เลือก `mart_core_daily`
3. กด **Connect** → **Add to Report**
4. สร้าง chart แรก: Time series — Dimension = `event_date`, Metric = `dau`
5. ถ้าต้องการเพิ่ม Retention heatmap: **Add data** อีกครั้ง → เลือก `mart_retention_daily`
   - Cross tab: Row = `cohort_date`, Column = `day_n`, Value = `retention_pct`

---

## Datasets ที่จะถูกสร้าง

| Dataset | คำอธิบาย |
|---|---|
| `analytics_staging` | Views (stg_*) |
| `analytics_transform` | Views (int_*) |
| `analytics_mart` | Tables (mart_*) — ให้ BI/Dashboard เชื่อมที่นี่ |
| `dataform_assertions` | Assertion results |
