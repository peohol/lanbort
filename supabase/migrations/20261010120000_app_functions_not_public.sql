-- Functions are executable by PUBLIC when created, and a schema's default
-- privileges cannot take that away, so three app functions created without
-- an explicit revoke still were. Nobody but the server reaches the app
-- schema, so this changes no behaviour; it keeps the functions closed if the
-- schema ever is not (pgTAP 0053 holds every app function to it).

revoke execute on all functions in schema app from public;
