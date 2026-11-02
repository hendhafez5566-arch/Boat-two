# CRM V3 safe rollback

Existing project a2751c62-5a61-4eb7-b3ca-0b98863e3069, preview e3e456fd-2c13-457d-91db-6aa80755f502 only.

Prior successful Web deployment: 27732997-a912-40dd-96be-8170c8b7b798.
Prior successful API deployment: 4c9f6f19-7433-496f-8569-9bce7a7def09.
Both application artifacts: 02802aa17bb3ea869af514ba16f2a6662e93e64b.

Deploy API first, verify migrations/health, then Web. Pin an exact tested SHA with connect-service-source; never enable automatic deploy or create resources.

If release fails, restore the prior application artifacts on those same services. Migrations102/103 are additive; leave new tables, optional columns, audit history and migration records intact. Do not delete customer data or reverse migrations by dropping structures. Old code ignores the additions. No Meta or bot configuration rollback is needed because none was changed.
