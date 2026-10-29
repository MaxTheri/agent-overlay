# Mage de bataille

Référence : `vRpB2H.gif`, 139 images, 13 960 ms. 136 images de 100 ms et trois de 120 ms, soit environ 9,96 images/s.

Création : planche de 40 poses générées avec l’outil intégré imagegen, puis corrections ciblées avec le même outil. Animation à 10 images/s, soit 100 ms par image, en boucle de 4 secondes. GIF de 594 × 594 pixels, agrandissement ×3 au plus proche voisin.

Le personnage est une mage de bataille adulte en tenue violette deux pièces. Trois attaques à l’épée précèdent la charge puis le lancer d’une boule de feu.

## Livrables

- `mage-bataille.gif` : animation finale.
- `mage-bataille-planche.png` : planche finale de 8 × 5 cases de 198 × 198 pixels.
- `images/` : les 40 images PNG individuelles avant agrandissement.
- `prompt-initial.txt`, `prompt-correction-personnage.txt`, `prompt-correction-epee.txt`, `prompt-nettoyage-epee.txt` : prompts imagegen exacts.
- `assembler.py` : découpage, calage vertical et encodage reproductibles.
- `verification.json` : contrôle des 40 images, durées, dimensions et calage.

Les poses d’attaque et de garde proviennent de la planche corrigée pour la présence du personnage. Les poses de magie (images 23 à 37) proviennent de la correction finale de l’épée. Aucun mouvement intermédiaire n’a été inventé par interpolation. Le script ne dessine aucun élément : il découpe les poses générées, cale la hauteur des bottes et assemble le GIF avec une palette commune.
