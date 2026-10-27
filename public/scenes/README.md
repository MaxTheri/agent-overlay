# Départ des agents

Après deux minutes de repos, chaque agent se lève, saisit la bulle de discussion
à sa gauche, la chiffonne entre ses mains, la lance puis part vers la gauche.
Le PC et le bureau restent immobiles. La scène dure 14,2 secondes, dont huit secondes pour rejoindre la sortie. Une reprise du
travail annule le départ et restitue la bulle. Les demandes à l’utilisateur
et les tours actifs restent affichés.

Les quatre planches `departures/<animal>.png` contiennent chacune seize cases
transparentes de 256 × 256 : quatre poses pour se lever, quatre pour saisir et
lancer, quatre pour chiffonner et quatre anciennes poses de départ conservées
pour la provenance. La marche utilise désormais `walks/<animal>.png` : huit
poses distinctes (contact, appui, passage, levée, puis la même séquence avec
l’autre jambe). Les jambes proche et éloignée sont différenciées. Le numéro de
pose dépend de la distance parcourue : un cycle gauche/droite couvre une foulée
de 48 pixels à la taille normale. La cadence suit donc le déplacement, sans
redémarrer lors des mises à jour. Le bureau reste fixe. La saisie est orientée vers
la gauche ; les poses de manipulation précèdent le lancer. La vraie bulle se
rapproche des mains, rétrécit puis devient une feuille de papier noir à 2,6 secondes. Les contours
se replient et les compressions suivent les quatre poses des mains : la feuille
devient une boule noire froissée, avec des plis éclairés, puis sort du champ. Tous les
mouvements sont calculés dans la même boucle de rendu que le personnage. Les
positions des mains sont mesurées pour chaque avatar et chaque pose : la boule
reste dans les mains jusqu’à leur ouverture (5,4 s pour ratel/renard, 5,8 s pour
firefox/capybara), puis sa trajectoire part de ce point. Rien ne redémarre à chaque mise à
jour, y compris en mode réduit. Les préférences de réduction des animations sont respectées.

Les sources et prompts imagegen intégrés sont dans `assets/scenes-source/departure-*`
et `assets/scenes-source/walk-*`. Les cycles de marche ont été créés avec
l’outil imagegen intégré ; les prompts finaux sont dans `walk-prompts.json`.
Les dessins sont assemblés et enregistrés sur une ligne de sol commune par
`python scripts/pack-walk-atlases.py assets/scenes-source/walk-manifest.json`.
Reconstruction : lancer Electron avec `scripts/pack-scene-atlases.js
assets/scenes-source/departure-manifest.json`, puis
`scripts/inspect-avatar-layout.js --measure` pour les tailles.

Les anciens dessins du patron, des réactions et des chocs restent archivés pour
leur provenance ; ils ne font plus partie de la scène de départ.
