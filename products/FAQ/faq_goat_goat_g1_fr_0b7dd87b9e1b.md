---
category: "GOAT"
model: "GOAT G1"
model_slug: "goat_g1"
lang: "fr"
source: "FAQ/GOAT/GOAT HQ support faq basic data _20230214.xlsx"
source_sheet: "FR"
source_row_id: "G00099"
kind: faq
version: 1
---

# Pourquoi la GOAT heurte-t-elle certains obstacles ?

## Question

Pourquoi la GOAT heurte-t-elle certains obstacles ?

## Answer

La GOAT G1 s'appuie principalement sur le capteur ToF avant et la vision par IA pour l'identification des obstacles :
(1) La fonction d'évitement d'obstacles ToF prend actuellement en charge 3 niveaux de hauteur (≥ 10 cm, ≥ 15 cm, ≥ 20 cm) et n'est pas en mesure d'identifier les obstacles inférieurs à 10 cm.
(2) La fonction ToF est incapable d'identifier les obstacles sur les côtés ou derrière la GOAT.
(3) La fonction ToF a du mal à identifier les objets noirs, blancs et transparents.
(4) Les surfaces bosselées peuvent affecter la précision de l'évitement par ToF.
(5) Actuellement, la fonction de reconnaissance par IA ne peut identifier que quelques obstacles, tels que les hérissons. Cette fonction doit être activée manuellement dans l'application.
(6) La vision par IA ne fonctionne pas bien dans des environnements sombres ou par temps pluvieux.
