# Animations des animaux

Quatre personnages : `capybara`, `firefox`, `ratel`, `renard`.

```text
animals/<animal>/
  activity/
    keyboard.png
    stretch.png
    classic.png
    book.png
  thinking/
    thought.png
    problem.png
  waiting/
    wave.png
    wave-classic.png
  end/
    intro.png
    console.png
  common/
    sulk.png
    coffee.png
    paw-movement.png
    head-scratch.png   # ratel et renard
```

`activity` regroupe le travail et les outils en cours, même longs. `thinking`
sert après 2 minutes sans nouvelle activité ni outil en cours, pendant un tour
actif. `waiting` est réservé aux demandes explicites de réponse ou
d’autorisation, avec les animations de main levée. `end` regroupe veille et
tâche terminée. `common`, dont `sulk`, contient des gestes naturels utilisables
dans les quatre groupes.

Chaque PNG contient une animation sur une ligne de cases transparentes de
256 × 256 pixels, déjà alignées par les pattes et mises à la même taille.
Toutes les planches ont exactement 64 cases (16384 × 256 pixels), y compris les
gestes communs et les introductions. Les poses originales sont réparties dans
leur ordre sur ces 64 cases ; certaines sont maintenues plusieurs cases.
Les allers-retours des boucles sont intégrés à l’ordre des cases.

Le serveur découvre les variantes en lisant les dossiers au chargement de la page.
`layout.json` enregistre la hauteur médiane des dessins de chaque planche. Le rendu
ramène cette hauteur à 218 unités et fixe les pieds à 242, avec une marge pour les
queues. Le bureau et le PC partagent un seul recalage vertical propre à chaque
animal ; les réactions conservent leur hauteur de clavier dédiée. Pour recalculer
les mesures après un ajout : lancer Electron avec
`scripts/inspect-avatar-layout.js --measure`. Sans mesure, une nouvelle planche
reste affichable à son échelle d'origine.
Déposer un PNG au même format dans un groupe puis recharger l’overlay suffit.
Les quatre groupes principaux doivent contenir une variante ; `common` est facultatif.

Une variante principale joue 64 poses à 111,11 ms par pose. Au changement de cycle,
un geste commun peut s’intercaler avec une probabilité de 20 %, sans deux gestes
communs consécutifs. Chaque planche dure 7,11 secondes à 111,11 ms par case.
Le geste commun joue une seule fois depuis sa première case, puis reprend
le groupe principal. La console utilise `end/intro.png` avant le cycle de jeu. Les quatre personnages
montrent la coque arrière de la console, se détendent avec les deux pieds sur le
plateau et un portable fermé. Les pieds passent devant le bureau, le portable
fermé reste au premier plan. Le groupe `end` ne joue plus les gestes communs
qui reposeraient les pieds au sol ; le travail rouvre le portable.
Le mode de réduction des animations conserve une pose fixe du groupe principal.

Les 54 planches actuelles proviennent des dessins existants. Le café et les gestes
partagés sont réutilisés ; aucune animation de sommeil/réveil n’a été générée.
Les sources sont dans `assets/animals-source/` ;
`scripts/split-animal-atlases.py` reproduit les nouvelles bandes avec Pillow.

Les animations de console proviennent de `assets/scenes-source/console-*-source.png`.
Pour les reconstruire : exécuter Electron avec `scripts/pack-scene-atlases.js
assets/scenes-source/console-manifest.json`, puis `scripts/build-console-animations.js`,
puis `scripts/inspect-avatar-layout.js --measure`. Les huit premières poses deviennent
une introduction de 64 cases ; les huit suivantes deviennent la boucle de 64 cases.
Les anciens GIF de console ont été retirés.
