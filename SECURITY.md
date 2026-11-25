# Sécurité / Security policy

## Signaler une faille

Merci de **ne pas ouvrir d'issue publique** pour un problème de sécurité.

Signale-le en privé sur GitHub : **Security → Report a vulnerability** sur ce dépôt. Indique ce qui est
touché, comment le reproduire et l'impact attendu. Accusé de réception sous 7 jours ; merci de laisser un
délai raisonnable pour corriger avant toute divulgation.

*Please report vulnerabilities privately through GitHub's "Report a vulnerability" button, never in a
public issue.*

## Périmètre

Dans le périmètre : la page construite (`lambda-90.html`, `site/index.html`), la chaîne de mise à jour
(workflows GitHub Actions, scripts de `pipeline/`) et les données publiées dans `data/` et `out/`.
Hors périmètre : les services tiers interrogés (fournisseurs de cotes, de résultats et de compositions) et
l'hébergeur de la page.

## Ce qui est déjà en place

- **Aucune clé d'API dans le dépôt** : les clés vivent uniquement dans les secrets GitHub Actions ;
  les workflows les lisent par variable d'environnement.
- **Commits du robot sous une identité dédiée** (`lambda90-bot`, adresse `noreply` de GitHub).
- **Page publiée non indexée** (`robots.txt`, en-têtes `_headers` sur l'hébergement).
- **Aucune prise de pari** : la page publie des probabilités et des calculs, elle ne transmet aucun ordre
  à un opérateur.
