# ADR-0003 — Privat E2EE-chat holdes adskilt fra strukturerte lånehendelser og saker

**Status:** Vedtatt
**Forankring:** PS-COM-005, PS-COM-008, PS-COM-013, PS-NFR-007

## Beslutning

Privat fritekst/vedlegg krypteres ende-til-ende og lagres som ciphertext. Avtale- og lånehendelser lagres som serverlesbar strukturert domenedata. Administrative saker er et tredje, serverlesbart men strengt autorisert domene.

## Begrunnelse

Lånbort må kunne håndheve avtaler og status uten å ha tilgang til privat samtale, og administratorer skal kunne behandle uttrykkelig innsendt saksdata uten en bakdør til hele privat chat.

## Sikkerhetsgrense

Beslutningen gir konfidensialitet mot ordinær serverlagring og administrativ tilgang til meldingsinnhold, men kan ikke alene beskytte mot kompromittert kode som kjører i brukerens klient. Webklientens integritet, supply chain og nøkkelhåndtering inngår derfor i trusselmodellen og OD-0005.
