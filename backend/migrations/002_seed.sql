-- Default pushed groups. Icons/widgets are inserted separately so UUIDs remain derivable.
-- We use deterministic UUIDs via md5 so that re-running migrations on a clean DB produces repeatable ids.

-- Helper: generate UUID from stable string
-- (pgcrypto digest returns bytea; we cast via uuid-ossp-like trick)

-- Group seed
INSERT INTO groups (id, name, icon, owner_id, pushed, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000001','主页','home',NULL,TRUE,0),
    ('00000000-0000-4000-8000-000000000002','AI 办公','briefcase',NULL,TRUE,1),
    ('00000000-0000-4000-8000-000000000003','工具','tool',NULL,FALSE,2),
    ('00000000-0000-4000-8000-000000000004','影音','play',NULL,FALSE,3),
    ('00000000-0000-4000-8000-000000000005','开发','code',NULL,FALSE,4)
ON CONFLICT DO NOTHING;

-- HOME
INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, is_folder, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','ChatGPT','https://chat.openai.com','AI Assistant',NULL,NULL,'sq','G',9,FALSE,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Claude','https://claude.ai','Anthropic',NULL,NULL,'sq','C',5,FALSE,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Gemini','https://gemini.google.com','Google',NULL,NULL,'sq','✦',1,FALSE,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Writing Studio','#','AI 写作 · 改写润色','Writing Studio','Start →','lg','W',5,FALSE,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Deck Maker','#','一键生成 PPT','Deck Maker','Start now','lg','D',3,FALSE,4),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Taobao','https://taobao.com',NULL,NULL,NULL,'circle-size','淘',0,FALSE,5),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','JD','https://jd.com',NULL,NULL,NULL,'circle-size','JD',0,FALSE,6),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Baidu','https://baidu.com',NULL,NULL,NULL,'circle-size','百',1,FALSE,7),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','GitHub','https://github.com',NULL,NULL,NULL,'circle-size','⌨',8,FALSE,8),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Notion','https://notion.so','notion.so',NULL,NULL,'pill-size','N',8,FALSE,9),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','Figma','https://figma.com','figma.com',NULL,NULL,'pill-size','F',4,FALSE,10);

-- WORK
INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, is_folder, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Perplexity','#','Search',NULL,NULL,'sq','P',7,FALSE,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Notion AI','#','Docs',NULL,NULL,'sq','N',8,FALSE,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Mid Journey','#','Images',NULL,NULL,'sq','M',6,FALSE,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Copilot','#','GitHub',NULL,NULL,'sq','©',1,FALSE,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Meeting Summary','#','自动生成会议纪要','Meeting Summary','New →','lg',NULL,6,FALSE,4),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Cursor','#','AI Code Editor',NULL,NULL,'pill-size','→',8,FALSE,5),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','Tana','#','tana.inc',NULL,NULL,'pill-size','T',0,FALSE,6);

-- TOOLS
INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, is_folder, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','PDF Toolkit','#','Merge · Split · Compress','PDF Toolkit','Open','lg',NULL,1,FALSE,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','Image','#','编辑器',NULL,NULL,'sq','◨',2,FALSE,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','Color','#','Palette',NULL,NULL,'sq','◉',9,FALSE,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','JSON','#','Format',NULL,NULL,'sq','{}',6,FALSE,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','Translator','#','translate.lumen',NULL,NULL,'pill-size','文',4,FALSE,4);

-- MEDIA
INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, is_folder, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','YouTube','https://youtube.com','Videos',NULL,NULL,'sq','▶',0,FALSE,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','Bilibili','https://bilibili.com','b站',NULL,NULL,'sq','B',1,FALSE,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','Spotify','#','Music',NULL,NULL,'sq','♫',2,FALSE,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','Netflix','#','Stream',NULL,NULL,'sq','N',0,FALSE,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','Featured','#','为你整理的播单','本周精选','Tune in','lg',NULL,6,FALSE,4);

-- DEV
INSERT INTO icons (id, group_id, name, url, sub, title, cta, size, letter, color, is_folder, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000005','GitHub','https://github.com','Code',NULL,NULL,'sq','⌨',8,FALSE,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000005','Docs','#','MDN',NULL,NULL,'sq','§',6,FALSE,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000005','Figma','https://figma.com','Design',NULL,NULL,'sq','F',4,FALSE,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000005','Local API','localhost:3000','dev.local',NULL,NULL,'pill-size','→',2,FALSE,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000005','Staging','#','staging.lumen',NULL,NULL,'pill-size','S',5,FALSE,4);

-- Widgets (pushed groups get default widgets)
INSERT INTO widgets (id, group_id, widget_type, w_span, sort_order) VALUES
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','countdown',2,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','clock',1,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','weather',2,2),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000001','calendar',1,3),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','todo',2,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','notes',2,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','calc',2,0),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000003','rss',2,1),
    (gen_random_uuid(),'00000000-0000-4000-8000-000000000004','music',2,0);

-- Default system settings
INSERT INTO app_settings (key, value) VALUES
    ('system', '{
        "public_access": false,
        "auto_assign_role": "user",
        "enable_drag": true,
        "enable_iframe": true,
        "audit_enabled": true,
        "dev_mode": false
    }'::jsonb)
ON CONFLICT DO NOTHING;
