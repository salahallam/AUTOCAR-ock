INSERT INTO vehicles(name,category,model_year,transmission,fuel,daily_price,image_path,description) VALUES
('Dacia Logan','Berline',2022,'Manuelle','Diesel',249,'assets/cars/car-1.jpg',''),
('Renault Clio','Citadine',2023,'Manuelle','Diesel',249,'assets/cars/car-2.jpg',''),
('Peugeot 208','Citadine',2023,'Manuelle','Essence',249,'assets/cars/car-3.jpg',''),
('Volkswagen Touareg','SUV',2021,'Automatique','Diesel',749,'assets/cars/car-4.jpg',''),
('Dacia Sandero','Citadine',2022,'Manuelle','Essence',199,'assets/cars/car-5.jpg','')
ON CONFLICT(name) DO UPDATE SET daily_price=EXCLUDED.daily_price,image_path=EXCLUDED.image_path,updated_at=NOW();
