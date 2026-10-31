-- ONE-TIME PREVIEW ONLY. No login, Meta credential, or customer data is read.
-- The migrator sets boat.preview_seed_channel only when BOAT_PREVIEW_ONLY and
-- WHATSAPP_PREVIEW_BOT_ENABLED are both true. Verify the exact Meta phone ID.
DO $demo$
DECLARE
  v_channel_id text := nullif(current_setting('boat.preview_seed_channel', true), '');
  v_preview_conversation text := nullif(current_setting('boat.preview_seed_conversation', true), '');
  v_channel record;
  v_source_id uuid;
  v_flow_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_items jsonb := '[{"key":"TR-001","name":"عمرة اقتصادية","description":"برنامج عمرة اقتصادي — تفاصيل الإقامة والخدمات يحددها مسؤول الشركة","category":"العمرة/اقتصادي","visible":true,"order":1,"fields":[{"label":"المدة","value":"7 ليالٍ","kind":"text"},{"label":"نوع الخدمة","value":"عمرة","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"بيانات تدريبية — أضف تفاصيل شركتك","kind":"text"}]},{"key":"TR-002","name":"عمرة مميزة","description":"برنامج عمرة مميز — تفاصيل الفندق والانتقالات تُحدد من الشركة","category":"العمرة/مميز","visible":true,"order":2,"fields":[{"label":"المدة","value":"10 ليالٍ","kind":"text"},{"label":"نوع الخدمة","value":"عمرة","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"بيانات تدريبية — ليست عرضًا فعليًا","kind":"text"}]},{"key":"TR-003","name":"عمرة رمضان","description":"استفسارات برامج عمرة رمضان، المواعيد بحسب توافر الشركة","category":"العمرة/رمضان","visible":true,"order":3,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"عمرة","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"بيانات تدريبية — ليست عرضًا فعليًا","kind":"text"}]},{"key":"TR-004","name":"برنامج حج","description":"الاستعلام عن برامج الحج وفق الشروط الرسمية السارية","category":"الحج","visible":true,"order":4,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"حج","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"لا توجد أسعار أو مواعيد مفترضة","kind":"text"}]},{"key":"TR-005","name":"رحلة الغردقة","description":"اطلب تفاصيل الرحلة ومواعيد الإقامة من الموظف","category":"الرحلات الداخلية/الغردقة","visible":true,"order":5,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"رحلة داخلية","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"بيانات تدريبية","kind":"text"}]},{"key":"TR-006","name":"رحلة شرم الشيخ","description":"خدمة الاستعلام عن الرحلات والفنادق المتاحة","category":"الرحلات الداخلية/شرم الشيخ","visible":true,"order":6,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"رحلة داخلية","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"بيانات تدريبية","kind":"text"}]},{"key":"TR-007","name":"تأشيرات سياحية","description":"استفسار عن المستندات المطلوبة والمدة وفق البلد والجنسية","category":"التأشيرات","visible":true,"order":7,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"تأشيرات","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"ليست توصيفًا لمتطلبات دولة محددة","kind":"text"}]},{"key":"TR-008","name":"عرض غير منشور للتجربة","description":"هذا الصف مخفي لاختبار إخفاء العناصر من الكتالوج","category":"العمرة/مميز","visible":false,"order":8,"fields":[{"label":"المدة","value":"","kind":"text"},{"label":"نوع الخدمة","value":"عمرة","kind":"text"},{"label":"السعر المكتوب","value":"","kind":"price"},{"label":"موعد السفر","value":"","kind":"text"},{"label":"ملاحظات","value":"لا يفترض ظهوره للعميل","kind":"text"}]}]'::jsonb;
  v_mapping jsonb := '{"id":"ID","name":"اسم البرنامج أو المنتج","description":"الوصف","category":"القسم","visible":"الحالة","order":"الترتيب","fields":[{"column":"المدة","label":"المدة","kind":"text"},{"column":"نوع الخدمة","label":"نوع الخدمة","kind":"text"},{"column":"السعر المكتوب","label":"السعر","kind":"price"},{"column":"موعد السفر","label":"موعد السفر","kind":"text"},{"column":"ملاحظات","label":"ملاحظات","kind":"text"}]}'::jsonb;
  v_graph jsonb;
BEGIN
  IF v_channel_id IS NULL THEN
    RAISE NOTICE 'QA_CATALOG_SKIPPED: only preview explicitly enables this import';
    RETURN;
  END IF;

  SELECT id,tenant_id INTO v_channel
    FROM channels WHERE id=v_channel_id::uuid
      AND type='whatsapp' AND status='active'
      AND external_id='1280213898505884';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_CATALOG_TARGET_MISMATCH: expected the already-connected WhatsApp 0904 preview channel';
  END IF;

  SELECT id INTO v_source_id FROM catalog_sources
    WHERE tenant_id=v_channel.tenant_id AND name='"كتالوج سياحي تجريبي — ملف Excel"' LIMIT 1;
  IF v_source_id IS NULL THEN
    INSERT INTO catalog_sources(tenant_id,name,kind,mapping,auto_sync,ai_enabled,revision,last_success_at,last_attempt_at)
      VALUES (v_channel.tenant_id,'"كتالوج سياحي تجريبي — ملف Excel"','file',v_mapping,false,false,1,now(),now())
      RETURNING id INTO v_source_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) AS entry(value) LOOP
    INSERT INTO catalog_products(
      id,tenant_id,sku,name,description,price_cents,currency,image_url,link_url,
      archived,source_id,external_key,category_path,sort_order,dynamic_fields,category_sort
    ) VALUES(
      gen_random_uuid(),v_channel.tenant_id,
      'excel-demo:'||v_source_id::text||':'||(v_item->>'key'),
      v_item->>'name',v_item->>'description',0,'EGP',NULL,NULL,
      NOT (v_item->>'visible')::boolean,v_source_id,v_item->>'key',
      v_item->>'category',(v_item->>'order')::numeric,v_item->'fields',0
    )
    ON CONFLICT(tenant_id,source_id,external_key) WHERE source_id IS NOT NULL
    DO NOTHING;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM catalog_sync_runs WHERE source_id=v_source_id AND status='success') THEN
    INSERT INTO catalog_sync_runs(tenant_id,source_id,status,item_count)
      VALUES (v_channel.tenant_id,v_source_id,'success',jsonb_array_length(v_items));
  END IF;

  SELECT id INTO v_flow_id FROM flows WHERE tenant_id=v_channel.tenant_id
    AND name='"تجربة بوت سياحي ديناميكي — كتالوج Excel"' LIMIT 1;
  IF v_flow_id IS NULL THEN
    v_graph := replace('{"policy":{"startFrequency":"always","sessionHours":24},"startNodeId":"tourism_welcome","nodes":[{"id":"tourism_welcome","type":"interactive","position":{"x":70,"y":70},"data":{"text":"أهلًا بحضرتك 🌙✈️\nده بوت تجريبي لعرض برامج السياحة من ملف Excel. اختار اللي يناسبك من الأزرار.","buttons":[{"id":"browse","title":"تصفح البرامج"},{"id":"agent","title":"تحدث مع موظف"}]},"edges":{"option:browse":"tourism_catalog","option:agent":"tourism_handoff","fallback":"tourism_catalog"}},{"id":"tourism_catalog","type":"catalog","position":{"x":390,"y":70},"data":{"sourceId":"__SOURCE_ID__","text":"تفضل اختار القسم، وبعدها البرنامج اللي حابب تعرف تفاصيله. البيانات من ملف Excel التجريبي.","native":false,"selectable":true,"saveAs":"selectedTourismProduct","emptyText":"القسم ده مفيهوش برامج ظاهرة حاليًا. جرّب قسم تاني."},"edges":{"next":"tourism_name"}},{"id":"tourism_name","type":"question","position":{"x":720,"y":70},"data":{"text":"ممكن أعرف اسم حضرتك علشان نسجل طلب البرنامج؟","answerType":"text","saveAs":"guestName","retries":2},"edges":{"ok":"tourism_date","fail":"tourism_handoff"}},{"id":"tourism_date","type":"question","position":{"x":1020,"y":70},"data":{"text":"تحب تسافر إمتى تقريبًا؟ (مثال: نوفمبر أو بعد شهر)","answerType":"text","saveAs":"travelWhen","retries":2},"edges":{"ok":"tourism_count","fail":"tourism_handoff"}},{"id":"tourism_count","type":"question","position":{"x":1320,"y":70},"data":{"text":"كام فرد هيسافروا؟ اكتب العدد بالأرقام.","answerType":"number","saveAs":"travelCount","errorText":"من فضلك اكتب عدد الأفراد بالأرقام.","retries":2},"edges":{"ok":"tourism_record","fail":"tourism_handoff"}},{"id":"tourism_record","type":"note","position":{"x":1620,"y":70},"data":{"body":"طلب من بوت كتالوج Excel التجريبي\nاسم العميل: {{guestName}}\nالبرنامج: {{selectedTourismProduct_name}}\nالموعد: {{travelWhen}}\nعدد الأفراد: {{travelCount}}\nلا تؤكد الأسعار أو المواعيد قبل مراجعة الموظف."},"edges":{"next":"tourism_handoff"}},{"id":"tourism_handoff","type":"handoff","position":{"x":1900,"y":70},"data":{"message":"تمام ✅ تم تسجيل طلب حضرتك، وهيتابعه موظف الشركة لتأكيد البرنامج والتوافر والسعر. شكرًا لتواصلك!"},"edges":{}}]}','__SOURCE_ID__',v_source_id::text)::jsonb;
    INSERT INTO flows(tenant_id,name,description,status,triggers,channel_ids,draft_graph,folder_name)
      VALUES(
        v_channel.tenant_id,'"تجربة بوت سياحي ديناميكي — كتالوج Excel"',
        'نموذج اختبار مخصص لصاحب المنصة، يعرض بيانات كتالوج Excel الحالية ويسجل الاستفسارات دون أسعار مفترضة.',
        'published','[{"type":"first_message"}]'::jsonb,
        ARRAY[v_channel.id]::uuid[],v_graph,'تجارب البوت'
      ) RETURNING id INTO v_flow_id;
    INSERT INTO flow_versions(tenant_id,flow_id,version,graph,triggers,channel_ids)
      VALUES(v_channel.tenant_id,v_flow_id,1,v_graph,'[{"type":"first_message"}]'::jsonb,ARRAY[v_channel.id]::uuid[])
      RETURNING id INTO v_version_id;
    UPDATE flows SET published_version_id=v_version_id WHERE id=v_flow_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM flows WHERE id=v_flow_id AND status='published') THEN
      RAISE EXCEPTION 'QA_CATALOG_FLOW_EXISTS_UNPUBLISHED: refusing to replace edited user bot';
    END IF;
  END IF;

  -- Activate only the already-connected QA channel; never touch other tenants
  -- or currently published bots.
  UPDATE channels SET settings=jsonb_set(
      coalesce(settings,'{}'::jsonb),
      '{activeBotFlowId}',to_jsonb(v_flow_id::text),true)
    WHERE id=v_channel.id;

  -- The existing 0904 preview chat previously handed off; reset ONLY this one.
  IF v_preview_conversation IS NOT NULL THEN
    UPDATE flow_sessions SET status='expired',updated_at=now()
      WHERE conversation_id=v_preview_conversation::uuid
        AND tenant_id=v_channel.tenant_id AND status='waiting';
    UPDATE conversations SET handled_by='bot',assigned_to=NULL,status='open'
      WHERE id=v_preview_conversation::uuid AND channel_id=v_channel.id
        AND tenant_id=v_channel.tenant_id;
  END IF;
  RAISE NOTICE 'QA_CATALOG_READY: source %, flow %, channel %',v_source_id,v_flow_id,v_channel.id;
END
$demo$;
