-- The list of a member's current environments checks whether a finalized
-- environment still has outstanding loans or their follow-up windows. All
-- actual loans belong to approved requests, whereas the existing partial
-- environment index covers only open requests.
create index loan_requests_approved_environment_idx
  on app.loan_requests (environment_id, id)
  where status = 'approved';
