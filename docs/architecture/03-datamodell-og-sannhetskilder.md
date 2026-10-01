# Datamodell og sannhetskilder

> **Status:** Logisk datamodell. Dette er ikke endelig SQL-skjema.

## Primær teknisk beslutning

Den transaksjonelle kjernen skal bruke **PostgreSQL eller tilsvarende relasjonell database med sterke transaksjons- og constraint-egenskaper**. For planleggingen velges PostgreSQL som referansemodell fordi tidsintervaller, referanseintegritet og samtidige reservasjoner må kunne håndheves nær dataene.

## Logiske tabell-/aggregatgrupper

### Identitet
- users
- profiles
- verified_contacts
- sessions / auth-provider linkage
- platform_roles

### Sosiale relasjoner
- friendships
- blocks

### Miljø
- environments
- environment_memberships
- environment_roles
- environment_invitations
- membership_requests
- membership_requirements
- environment_type_change_processes

### Objekt
- objects
- object_owners
- object_owner_restrictions
- availability_intervals
- environment_publications
- object_subscriptions
- object_question_threads / posts
- object_versions eller tilsvarende endringshistorikk

### Lån
- loan_requests
- loans
- loan_agreement_snapshots
- loan_reservations
- loan_events
- responsible_lender_transfers
- return/problem events

### Kommunikasjon
- conversations
- conversation_participants
- encrypted_messages
- encrypted_message_attachments
- administrative_conversations / case_messages

### Varsler
- notifications
- notification_preferences
- delivery_attempts

### Saker og moderering
- cases
- case_participants
- case_assignments
- case_submissions
- reports
- moderation_actions
- representative_grants

### Tillit
- review_rights
- reviews
- review_scores
- review_responses
- review_moderation_events

### Historikk og asynkrone hendelser
- audit_events
- outbox_events
- security_events med separat retention

## Sannhetskilder

- **Konto-/profilstatus:** users/profiles
- **Miljøadgang:** memberships + roles + type/state
- **Objekteierskap:** object_owners
- **Global objektinformasjon:** objects + availability
- **Publisering i miljø:** environment_publications
- **Faktisk lånereservasjon:** loan_reservations / godkjent loan
- **Avtalehistorikk:** loan_agreement_snapshot + loan_events
- **Privat chatinnhold:** klientenes dekrypterbare ciphertext; serveren har ingen klartekst-sannhet
- **Saksinnhold:** case data
- **Synlig tillitsgrunnlag:** publiserte, gyldige review-data; aggregater er avledet
- **Søk:** aldri sannhetskilde; kun avledet indeks

## Historiske snapshots

Når et lån godkjennes skal nødvendige felt som beskriver objektet og vilkårene ved avtaleinngåelsen lagres som et historisk snapshot eller på annen måte kunne rekonstrueres uten å bruke dagens mutable objektdata.

## Sletting

Fysisk sletting, pseudonymisering og tombstones må støtte at aktive relasjoner forsvinner uten at referanseintegriteten til legitim felles historikk brytes. Historiske poster skal ikke beholde aktiv profilkobling når den ikke lenger er nødvendig.
