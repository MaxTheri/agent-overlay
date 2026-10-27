# Agent Overlay

Une petite application macOS qui garde **tes agents IA visibles en permanence** : Codex et Claude Code apparaissent sous forme d'animaux illustrés, en bas à droite de l'écran, avec une bulle qui dit ce qu'ils font, où ils en sont et quand ils ont besoin de toi. L'overlay reste au-dessus des autres fenêtres, y compris en plein écran, et laisse passer les clics.

## Pourquoi ce projet

Quand plusieurs agents travaillent en parallèle (plusieurs conversations Claude Code, Codex Desktop, des sous-agents…), on perd vite le fil : qui travaille, qui a fini, qui attend une autorisation ou une réponse ? Il faut basculer d'application en application pour le savoir.

Le projet est parti d'[Agent Standup](https://github.com/Atoll92/agent-standup) (une extension VS Code qui rejoue les sessions Claude Code comme une réunion d'équipe). L'idée ici est différente : plutôt que de rejouer une session, **afficher en direct, en permanence et sans rien ouvrir** l'état d'avancement de chaque agent. L'overlay ne parle pas, ne joue aucun son et n'appelle aucun modèle : il lit seulement les journaux que les agents écrivent déjà sur ta machine.

## Ce que tu vois

- **Un animal par agent** (ratel, renard, renard de feu, capybara), avec une apparence stable tant que l'agent est affiché. Les animaux affichés en même temps sont toujours différents.
- **Une bulle d'activité** : la commande en cours, la dernière phrase de l'agent, ou l'erreur rencontrée. Un clic sur la bulle la développe.
- **Un état clair** pour chaque agent :

  | État | Signification |
  |---|---|
  | Au travail | Outil ou réponse en cours |
  | Outil en cours | Un outil tourne depuis plus d'une minute |
  | Réflexion longue | Tour actif sans activité depuis plus de 2 minutes |
  | **Besoin de toi** | Question posée, plan à valider ou autorisation d'exécution demandée |
  | Erreur | Un outil a échoué |
  | Terminé | La tâche est finie (reste 2 minutes en pause, puis l'agent quitte la scène) |
  | En veille | Aucune activité récente |

- **L'application d'origine** de chaque agent (« Codex Desktop », « Codex VS Code », Claude Desktop, terminal…). Quand une tâche est terminée, un clic sur l'avatar remet cette application au premier plan.
- **Les sous-agents**, rattachés à leur agent principal.
- Quatre agents à la fois, un bouton « Agents suivants » au-delà. Les questions et les erreurs passent en premier.

## Prérequis

- macOS (Apple Silicon ou Intel). L'overlay s'appuie sur des API macOS : les builds Windows et Linux n'existent pas.
- [Node.js](https://nodejs.org) et npm (testé avec Node 24).
- Codex et/ou Claude Code utilisés sur la même machine, pour que leurs journaux existent.
- Pour compiler l'application `.app` : les outils en ligne de commande Xcode (`xcode-select --install`).

## Lancer le projet

```bash
git clone https://github.com/MaxTheri/agent-overlay.git
cd agent-overlay
npm --prefix desktop install   # installe Electron (une seule fois)
npm run overlay                # lance l'overlay
```

Le dépôt contient environ 150 Mo d'images (planches d'animation et sources) : le clonage peut prendre un moment.

L'application n'a pas d'icône dans le Dock. Elle vit dans la barre de menus (tête de renard) ; c'est de là qu'on la configure et qu'on la quitte.

Autres commandes :

```bash
npm run overlay:demo    # mode démo : activités fictives, avec un indicateur explicite
npm run overlay:build   # compile l'application autonome (voir plus bas)
npm test                # lance les tests
```

Tu peux aussi double-cliquer sur `desktop/Agent Overlay.command` une fois Electron installé : il ouvre la version actuelle du dépôt sans passer par le terminal.

### Compiler l'application

```bash
npm run overlay:build
```

Le script produit `dist-desktop/Agent Overlay-darwin-<arch>/Agent Overlay.app`, signée localement (signature ad hoc, sans notarisation Apple). Tu peux la glisser dans `/Applications`. Au premier lancement, macOS peut demander une confirmation, car l'application n'est pas notarisée.

## Utilisation

- **Barre de menus** : masquer/afficher les agents, réduire les bulles, choisir les sources (Codex + Claude Code, Codex seul ou Claude Code seul), choisir l'écran, replacer l'overlay en bas à droite, activer le mode démo, prévisualiser le départ d'un agent, quitter.
- **Raccourci** : `⌘ ⇧ A` masque ou affiche les agents.
- **Déplacer l'overlay** : glisser la barre « AGENTS EN DIRECT ». La position est mémorisée entre les lancements.
- **Réduire** : le bouton − ne garde que les personnages ; + rétablit les bulles.
- **Clics** : les zones transparentes laissent passer les clics vers l'application dessous, et l'overlay ne prend jamais le focus clavier.
- Le réglage macOS « Réduire les animations » est respecté (pose fixe).

## Comment ça marche

L'overlay ne se branche sur rien : il **lit** les journaux de sessions, sans jamais les modifier.

- Claude Code : `~/.claude/projects` (ou `CLAUDE_CONFIG_DIR`)
- Codex : `~/.codex/sessions` (ou `CODEX_HOME`)
- Surcharges possibles : `AGENT_STANDUP_PROJECTS` et `AGENT_STANDUP_CODEX`

La liste est rafraîchie toutes les 1,5 seconde. À partir des événements du journal, `overlay/activity.js` déduit l'état de chaque agent, `overlay/collector.js` regroupe les sessions et leurs sous-agents, et l'interface (`public/overlay*`) dessine les personnages et les bulles dans une fenêtre Electron transparente (`desktop/main.js`).

Quelques règles de détection à connaître :

- Un tour ouvert (début de tâche Codex, ou réponse Claude avec réflexion/outils et sans fin de tour) reste « au travail » pendant les silences. Les fins de tâche et les interruptions le ferment. Un tour non fermé expire après 30 minutes sans mise à jour.
- Sans indication de tour ouvert, 3 minutes de silence passent l'agent en veille et 10 minutes le retirent.
- Une modification restée sans résultat pendant 15 secondes est affichée comme une demande possible à l'utilisateur : c'est une heuristique.
- Les appels Codex demandant une autorisation d'exécution (`require_escalated`) affichent « Besoin de toi » jusqu'au retour de l'appel.
- À la fin d'une tâche, l'agent se lève, prend son portable, le jette hors champ, se frotte les mains puis s'en va à pied. Une reprise du travail annule ce départ.

## Limites

- Les formats de journaux peuvent évoluer ; la collecte se fonde sur ce qu'ils exposent. Certains outils Codex ne publient leur événement qu'à la fin de l'exécution.
- Les journaux ne permettent pas de certifier qu'un processus est encore connecté.
- Le clic sur un avatar active l'application déjà ouverte, mais ne sélectionne pas une conversation, un onglet de terminal ou une fenêtre précise. Si plusieurs applications hébergent le même CLI dans le même dossier, l'application est indiquée comme inconnue.
- Les bulles sont limitées aux 12 sessions récentes, pour garder l'affichage léger.
- Certaines fenêtres protégées du système peuvent passer devant l'overlay.
- Les messages restent dans la langue du journal ; seuls les libellés d'action sont en français.

## Développement

```bash
npm --prefix desktop install
npm run overlay                # lancement en développement
npm run overlay:demo
node --test test/*.test.js     # ou : npm test
```

Organisation du dépôt :

| Chemin | Rôle |
|---|---|
| `desktop/` | Application Electron : fenêtre transparente, placement, clics, menu de la barre macOS, aide native `activate-app` (Swift) |
| `overlay/` | Logique de l'overlay : états des agents, regroupement des sessions, application d'origine, glisser-déposer, catalogue des animaux |
| `server.js`, `codex.js` | Lecture des journaux Claude Code et Codex, et petit serveur local pour les fichiers de `public/` (code repris d'Agent Standup) |
| `public/overlay.*` | Interface : personnages, bulles, mouvements, départ |
| `public/animals/` | Planches d'animation : `<animal>/<groupe>/<variante>.png` |
| `public/scenes/` | Planches de la scène de départ et de la marche (voir `public/scenes/README.md`) |
| `assets/` | Sources et prompts des images, pour reproduire les planches |
| `scripts/` | Construction de l'application, découpage et recalage des planches, vérifications visuelles |
| `test/` | Tests (`node --test`) |

Les planches d'animaux : chaque PNG contient une animation sur une ligne de 64 cases de 256 × 256 pixels, jouée en 7,11 secondes. Quatre groupes pilotent le rendu : `activity` (travail et outils), `thinking` (réflexion longue), `waiting` (demande explicite de réponse ou d'autorisation) et `end` (veille et fin de tâche). Le dossier `common` contient des gestes partagés (café, mouvements de pattes…) joués de temps en temps entre deux cycles. Le serveur découvre les PNG à chaque chargement de la page. Détails dans `public/animals/README.md`.

## Crédits et licence

Basé sur [Agent Standup](https://github.com/Atoll92/agent-standup) (© 2026 Arthur), sous licence MIT : la lecture des journaux Claude Code et Codex en est reprise. Licence MIT, voir [LICENSE](LICENSE).
