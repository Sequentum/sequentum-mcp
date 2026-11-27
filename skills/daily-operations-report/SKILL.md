---
name: daily-operations-report
description: Use when the user wants a daily operations report for their Sequentum account. Covers the last 24 hours of runs and failures, records extracted, credit balance and spending, and the runs scheduled next.
---

# Daily operations report

Generate a comprehensive daily operations report. Follow these steps:

1. Use get_runs_summary to get all runs from the last 24 hours, including failed run details.
2. Use get_records_summary to get the total records extracted and exported today.
3. Use get_credits_balance to check the current credit balance.
4. Use get_spending_summary to get today's spending.
5. Use get_scheduled_runs to see which agents are scheduled to run in the next 24 hours.
6. Compile a report covering: run statistics (total, succeeded, failed), records processed, any failures with brief diagnostics, the current credit balance and spending, and upcoming scheduled runs.
