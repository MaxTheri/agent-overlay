# Sources des animations

Planches originales générées avec image_gen et prompts de provenance pour les
quatre animaux conservés. Les fichiers sans suffixe sont les premières références.
Les fichiers `*-animated.png` et `*-extras.png` sont les sources du découpage.
`registration.json` contient leur découpe et leur recalage historique.
Ces fichiers ne sont pas chargés par l'overlay ni embarqués dans son bundle.

Pipeline de préparation avec Python, Pillow et NumPy :

1. `scripts/clean-animal-alpha.py` nettoie les planches de base ; `--extras` nettoie
   les planches supplémentaires. Ce nettoyage modifie les sources.
2. `scripts/register-animal-frames.py` recalcule les rectangles et l'alignement.
3. `scripts/split-animal-atlases.py` exporte les animations dans `public/animals/`.

Le découpage utilise les dessins existants. Il intègre la mise à la même taille,
l'ancrage des pattes et l'ordre des poses dans les bandes exportées.
Les variantes ajoutées directement dans les dossiers de l'application restent
indépendantes de ce pipeline.

Les introductions et boucles de console ont été remplacées par les planches
transparentes `assets/scenes-source/console-*-source.png`, générées avec imagegen.
Le script de découpage historique les conserve. Utiliser le pipeline console
décrit dans `public/animals/README.md` pour les reconstruire.
