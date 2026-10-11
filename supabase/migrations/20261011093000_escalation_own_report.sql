-- PS-TRUST-016: an administrator's escalation is a report of its own about
-- what the environment report is about. Each environment report they act
-- on goes to the platform as its own case, apart from their own report
-- about the same thing and from what they escalated from another
-- environment. A second report by the same reporter about the same thing,
-- with the same origin, still writes into the open one.
drop index app.cases_one_open_moderation_report;

create unique index cases_one_open_moderation_report
  on app.cases (
    opened_by_user_id, kind, environment_id, report_target, subject_user_id, object_id,
    review_id, escalated_from_case_id
  ) nulls not distinct
  where kind in ('environment_report', 'platform_report') and status = 'open';
