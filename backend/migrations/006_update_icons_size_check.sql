ALTER TABLE icons DROP CONSTRAINT icons_size_check;
ALTER TABLE icons ADD CONSTRAINT icons_size_check CHECK (size IN ('sq','pill-size','circle-size','lg','lg-4','lg-9'));
