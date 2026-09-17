# dataform-ga4-template

Dataform pipeline template สำหรับทุก app ที่ใช้ **GA4 → BigQuery Export**

## สิ่งที่ได้ทันที (ไม่ต้องเขียนเพิ่ม)

| Table | คำอธิบาย |
|---|---|
| `mart_core_daily` | DAU, New Users, Sessions รายวัน × Country × OS |
| `mart_retention_daily` | Cohort Retention D0–D30 แบบ Long Format (Heatmap-ready) |

## วิธีใช้

### 1. Fork หรือ Use as Template
กด **Use this template** → สร้าง repo ใหม่ใน GitHub ของคุณ

### 2. อ่าน CLAUDE.md และทำตาม Setup Checklist
ไฟล์ `CLAUDE.md` คือคู่มือสำหรับ AI — เปิด Claude Code แล้วแนบ CLAUDE.md ในการสนทนา AI จะทำ setup ให้ตามขั้นตอน

### 3. แก้ workflow_settings.yaml
```yaml
defaultProject: YOUR_BQ_PROJECT
vars:
  ga4_dataset: YOUR_BQ_PROJECT.analytics_YOUR_PROPERTY_ID
  app_name: YOUR_APP_NAME
```

### 4. เขียน event pipeline ของ app ตัวเอง
- copy `stg_custom_events.sqlx` → เขียนตาม events ของ app
- copy `int_custom_kpis.sqlx` → aggregate metrics
- copy `mart_custom_daily.sqlx` → final output table

## โครงสร้าง Pipeline

```
GA4 BigQuery Export (events_*)
    ↓
staging/   stg_*  — extract + clean event_params
    ↓
transform/ int_*  — aggregate + business logic
    ↓
mart/      mart_* — incremental tables (BI layer)
```

## Requirements

- Google Cloud project with GA4 BigQuery export enabled
- Dataform repository linked to this GitHub repo
- Service Account with `bigquery.dataEditor` + `bigquery.jobUser` roles

## สำหรับ AI

อ่าน `CLAUDE.md` ก่อนทุกครั้ง — ไฟล์นั้นมี setup checklist, SQL standards, และ git workflow ครบ
