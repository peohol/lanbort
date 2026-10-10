-- PS-ENV-019 (OD-0052): when the administrators ask an applicant for more
-- information, they may write one short question. It belongs to the
-- application, not to private chat or the profile: it lives on the
-- membership only while the application waits on the applicant, and goes
-- as soon as the application moves on (answers sent again, approved,
-- rejected, withdrawn or ended), so it follows the application's access and
-- deletion. The trigger clears it for every writer; the check keeps it from
-- outliving that stage.
alter table app.environment_memberships
  add column information_question text,
  add constraint environment_memberships_information_question_check
    check (
      information_question is null
      or (
        review_stage = 'information_requested'
        and char_length(information_question) between 1 and 300
        and information_question = btrim(information_question)
      )
    );

create function app.clear_membership_information_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.review_stage is distinct from 'information_requested' then
    new.information_question := null;
  end if;

  return new;
end;
$$;

create trigger environment_memberships_clear_information_question
  before update of review_stage on app.environment_memberships
  for each row
  execute function app.clear_membership_information_question();
