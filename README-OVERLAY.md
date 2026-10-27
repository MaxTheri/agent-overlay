# Agent Overlay

Adaptation locale de [Agent Standup](https://github.com/Atoll92/agent-standup), sous licence MIT. L'application macOS affiche des animaux illustrés avec leurs bulles d'activité, en bas à droite, au-dessus des fenêtres et des espaces plein écran.

## Utilisation

Le lanceur personnel `~/Desktop/Agent Overlay.command` ouvre la version actuelle du dépôt par double-clic. Il utilise le runtime Electron installé dans `desktop/node_modules`, sans dépendre de npm dans le terminal. Une tête de renard monochrome identifie l’overlay dans la barre de menus ; ses PNG normal et Retina sont produits par `scripts/build-overlay-tray.py`.

Ouvrir `dist-desktop/Agent Overlay-darwin-arm64/Agent Overlay.app` après compilation. L'application reste dans la barre de menus, sans icône dans le Dock.

- Les activités réelles de Codex et Claude Code apparaissent automatiquement.
- Cliquer sur une bulle développe le message ou la commande.
- Lorsque la tâche est terminée, cliquer sur l'avatar remet l'application liée au premier plan. La bulle reste disponible pour consulter les détails. Le nom distingue notamment « Codex Desktop » et « Codex VS Code ». Aucune activation automatique n'a lieu à la fin d'une tâche.
- Faire glisser la barre « AGENTS EN DIRECT » déplace l'overlay à la souris. La position est mémorisée entre les lancements et reste stable quand les bulles changent de hauteur. Le menu « Replacer en bas à droite » rétablit la position initiale.
- Le bouton − réduit l'affichage aux personnages ; + rétablit les bulles.
- Le menu de la barre macOS choisit les sources, l'écran et le mode démo, ou quitte l'application.
- `⌘ ⇧ A` masque ou affiche les agents.
- Quatre agents sont affichés à la fois, avec un bouton « Suivants » si nécessaire. Les questions et erreurs passent en premier.
- Les zones transparentes laissent les clics atteindre l'application dessous. L'affichage ne prend pas le focus clavier.

Aucune voix, musique, son ou appel de modèle. Les messages restent dans la langue du journal ; seuls les libellés d'action sont en français. Le mode démo contient des activités fictives et porte un indicateur explicite.

Les quatre animaux (ratel, renard, renard de feu et capybara) gardent une apparence stable liée à leur agent, dans un style de dessin animé 2D inspiré du Roi Lion / La Garde du Roi Lion. Les 54 planches sont rangées dans `public/animals/<animal>/<action>/<variante>.png`, par exemple `capybara/activity/keyboard.png` ou `renard/waiting/wave.png`. Chaque PNG contient une seule animation, sur une ligne de 64 cases transparentes de 256 × 256 pixels (16384 × 256 pixels). Toutes les planches, introductions et gestes communs inclus, durent 7,11 secondes à 111,11 ms par case. Les poses existantes sont réparties dans leur ordre sur les 64 cases. Le bureau et le portable constituent un calque SVG fixe.

Le serveur découvre les PNG à chaque chargement de la page. Quatre groupes pilotent le rendu : `activity` pour le travail et les outils en cours, `thinking` après 2 minutes sans activité ni outil en cours pendant un tour actif, `waiting` uniquement pour une demande explicite de réponse ou d’autorisation, et `end` pour la veille et la fin de tâche (console). Les mains levées sont dans `waiting` et les attitudes boudeuses (`sulk`) dans `common`, disponible dans les quatre groupes. La durée d’un outil et une erreur ne déclenchent pas `waiting`. Chaque cycle choisit une variante du groupe au hasard, en évitant de reprendre immédiatement le même fichier lorsque plusieurs variantes existent. Les cycles principaux jouent 64 poses à 111,11 ms par pose, avec une phase propre à chaque agent.

Le dossier `common` contient les gestes naturels partagés : café, mouvements de pattes et patte à la tête pour le ratel et le renard. Après un cycle principal, le lecteur a 20 % de chances de jouer un geste commun. Il joue cette planche pendant 7,11 secondes depuis le début, puis reprend le groupe principal ; deux gestes communs ne se suivent pas. Ces gestes visuels ne changent pas l’état réel de l’agent. Les dessins existants sont réutilisés ; aucune animation de sommeil/réveil n’a été créée.

La console utilise `end/intro.png` avant son cycle de jeu lorsqu’elle est choisie. Les rafraîchissements du journal ne recommencent pas les animations. Le recalage de la taille et des pattes est intégré aux PNG lors du découpage ; le rendu découpe simplement une case sur la ligne.

Les animaux affichés simultanément sont différents, même lorsque les identifiants auraient produit le même avatar. Leur attribution reste stable pendant leur présence sur la page. Les planches originales et leurs prompts sont conservés dans `assets/animals-source/`. `scripts/split-animal-atlases.py` reproduit le découpage à partir de ces sources et de leur ancien recalage. Le réglage macOS de réduction des animations conserve une pose fixe pertinente.

## Sources et limites

La collecte reprend les lecteurs incrémentaux du projet original : `~/.claude/projects` et `~/.codex/sessions`, ainsi que les variables `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `AGENT_STANDUP_PROJECTS` et `AGENT_STANDUP_CODEX`. Les journaux sont seulement lus. La liste est rafraîchie toutes les 1,5 secondes, avec le cache de scan d'origine (environ 2 secondes).

Les sous-agents Claude sont reconnus par leurs journaux et métadonnées. Les sous-agents Codex sont reconnus lorsque leur journal indique le parent (`parent_thread_id` ou `source.subagent.thread_spawn.parent_thread_id`). Les revues automatiques de permissions sont exclues. Les formats de journaux peuvent évoluer ; la collecte est fondée sur ce que les journaux rendent disponible. Certains outils Codex ne publient leur événement qu'à la fin de l'exécution.

Une modification restée sans résultat pendant 15 secondes est affichée comme une demande potentielle à l'utilisateur : c'est une heuristique du projet original. Un outil en cours depuis plus d'une minute est marqué en attente. Un tour explicitement ouvert (début de tâche Codex, ou réponse Claude avec réflexion/outils et sans fin de tour) reste au travail pendant les silences, y compris après les anciens délais de trois et dix minutes. Les fins de tâche et interruptions ferment le tour ; les tâches terminées restent deux minutes en pause. L’agent se lève (0–1,6 s), prend son portable et le jette hors champ (1,6–3,6 s), se frotte les mains (3,6–6,2 s), puis s’en va à pied vers la gauche (6,2–10 s). Le portable est animé séparément et reste absent après son lancer ; le bureau reste en place. Les quatre personnages disposent chacun de seize poses dédiées. La scène ne contient plus de boulette. Une reprise du travail l’annule. Le menu « Aperçu du départ des agents » la déclenche immédiatement pour la tester. Sans indication de tour ouvert, trois minutes de silence déclenchent la veille et dix minutes retirent l'agent. Un tour non fermé expire après trente minutes sans mise à jour du journal, pour éviter de garder indéfiniment une session interrompue brutalement. Les journaux ne permettent pas de certifier qu'un processus est encore connecté.

Les planches du patron et des réactions sont décrites dans `public/scenes/README.md` : 64 images pour le lion, 16 images de surprise et de frappe nerveuse dans une seule planche par animal.

Les bulles sont limitées à 12 sessions récentes pour garder la surimpression légère. Les fenêtres protégées du système peuvent passer devant l'affichage. L'application est signée localement, sans notarisation Apple ; les builds Windows/Linux n'ont pas été vérifiés.

Les appels Codex demandant une autorisation d’exécution (`require_escalated`) sont suivis dès leur enregistrement brut, même avant l’événement d’outil terminé. L’avatar affiche « Besoin de toi » jusqu’au retour de cet appel. Une autorisation déjà accordée automatiquement peut rendre cette transition très brève.

Sur macOS, l'application d'origine est identifiée par les métadonnées de la session (Desktop/VS Code), ou par le processus et son application parente pour les clients CLI. Une association CLI connue reste mémorisée si le processus se termine. Si plusieurs applications hébergent le même CLI dans le même dossier et que la source ne permet pas de trancher, l'overlay affiche que l'application est inconnue. Un clic active l'application déjà ouverte ; il ne sélectionne pas une conversation, un onglet de terminal ou une fenêtre précise. Cette activation AppKit ne nécessite pas de permission d'accessibilité.

## Développement

```sh
npm --prefix desktop install
npm run overlay
npm run overlay:demo
npm run overlay:build
node --test test/overlay.test.js test/server.test.js test/codex.test.js
```

`overlay/activity.js` produit les états et textes depuis les timelines ; `overlay/collector.js` regroupe les sessions et leurs sous-agents ; `public/overlay.*` dessine les personnages et bulles ; `desktop/main.js` assure la fenêtre transparente, le placement, les clics et le menu macOS. Les fonctions de l'extension et du serveur Web d'origine restent dans le dépôt pour conserver la provenance et faciliter les mises à jour.
