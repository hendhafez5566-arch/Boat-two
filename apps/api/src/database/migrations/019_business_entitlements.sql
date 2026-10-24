UPDATE plans SET features=features||jsonb_build_object('automations',code IN ('pro','business')),
 limits=limits||CASE code
 WHEN 'free' THEN '{"ai_agents":1,"automation_rules":0,"campaigns_per_month":0}'::jsonb
 WHEN 'starter' THEN '{"ai_agents":1,"automation_rules":0,"campaigns_per_month":10}'::jsonb
 WHEN 'pro' THEN '{"ai_agents":5,"automation_rules":50,"campaigns_per_month":100}'::jsonb
 ELSE '{"ai_agents":-1,"automation_rules":-1,"campaigns_per_month":-1}'::jsonb END;
