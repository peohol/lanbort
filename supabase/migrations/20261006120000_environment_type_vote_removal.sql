-- Hidden → closed (PS-ENV-008, OD-0012): a member who has not accepted the
-- new visibility by the deadline of an adopted vote is removed, not made
-- passive. The membership ends, and any environment role ends first under
-- the continuity rules (PS-ENV-013), with this as the reason for both.

alter table app.environment_memberships drop constraint environment_memberships_end_reason_check;
alter table app.environment_memberships add constraint environment_memberships_end_reason_check
  check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn', 'environment_wound_down',
    'environment_type_changed', 'type_change_not_accepted', 'account_deleted'
  ));

alter table app.environment_role_grants drop constraint environment_role_grants_revoke_reason_check;
alter table app.environment_role_grants add constraint environment_role_grants_revoke_reason_check
  check (revoke_reason in (
    'resigned', 'removed', 'transferred', 'account_departed',
    'type_change_not_accepted'
  ));
