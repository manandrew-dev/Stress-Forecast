# Databricks screenshots

How we used Databricks, for the "Best Use of Databricks" track. Upload the same images to the Devpost gallery.

Add yours the same way as [`docs/freebuff/`](../freebuff/README.md). **Never** screenshot the notebook with the `DATABASE_URL` widget filled in.

## Deadline patterns notebook (Khan, #22)

- `22-deadline-patterns-notebook-1-khan.png`: the `deadline_patterns` notebook on Databricks (Serverless). It finds which deadline patterns come before cohort stress spikes and writes plain-language findings to the `insights` table shown in the rep Insights page. Its privacy note: it only reads `daily_course_stress` rows with `n_students >= 5`, plus deadlines and courses, never check-ins, user ids or raw text, and it doesn't call Gemini. The `SOURCE` (synthetic or Tiger Data) and `WRITE` (dry run by default) widgets control where it reads from and whether it writes; the database URL comes from a Databricks secret.
