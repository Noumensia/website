/*
  Provenance du visiteur : d'où vient-il quand il arrive sur /contact ou /rendez-vous ?
  (26/10/2026)

  1. ?sujet=xxx dans l'URL (posé par les boutons des pages modèles, articles, décryptages)
  2. sinon, la page du site d'où il arrive (document.referrer, même domaine uniquement)

  window.nmProvenance() renvoie { cle, source, info } où source vaut "lien" ou "navigation",
  et info contient les textes adaptés (null si la provenance est inconnue).
  Pour ajouter une provenance, il suffit d'ajouter une entrée dans SUJETS et, si besoin,
  une règle dans CHEMINS.
*/
(function () {
  var SUJETS = {
    'ai-act': {
      libelle: 'le décryptage AI Act',
      href: '/decryptages/ai-act/',
      avant: "Vous arrivez du décryptage AI Act. Si vous avez déjà un outil en tête, tri de CV, scoring de candidats ou entretien vidéo analysé par IA, notez son nom dans le champ de notes, on partira de ce cas concret plutôt que du texte du règlement.",
      apres: "Comme vous venez du décryptage AI Act, si vous avez noté un outil je regarderai avant notre échange comment il se qualifie, et si vous voulez prendre un peu d'avance, le parcours de qualification donne une première réponse en quelques minutes.",
      liens: [
        { texte: 'Qualifier un outil', href: '/decryptages/ai-act/parcours-qualification' },
        { texte: 'Lister ses obligations', href: '/decryptages/ai-act/registre-obligations' }
      ]
    },
    'turnover': {
      libelle: 'le modèle Turnover volontaire',
      href: '/modeles/turnover',
      avant: "Vous arrivez du modèle Turnover volontaire. Les indicateurs que vous suivez déjà, taux de départ, enquête d'engagement ou entretiens de sortie, sont un très bon point de départ, inutile de préparer quoi que ce soit de plus.",
      apres: "Puisque vous venez du modèle Turnover, on partira de ce que vos indicateurs montrent aujourd'hui pour voir ce qu'un modèle adapté à votre contexte vous apprendrait en plus, et si vous avez une enquête récente ou quelques chiffres sous la main ils seront utiles, sans être indispensables.",
      liens: [
        { texte: "D'où viennent les ratios de coût du turnover", href: '/articles/cout-turnover-ratios' },
        { texte: 'Revoir le modèle Turnover', href: '/modeles/turnover' }
      ]
    },
    'article-turnover': {
      libelle: "l'article sur les causes du turnover",
      href: '/articles/causes-turnover-recherche',
      avant: "Vous arrivez de l'article sur les causes du turnover. On pourra partir des facteurs qui vous ont parlé et regarder lesquels pèsent vraiment dans votre organisation.",
      apres: "Vous venez de l'article sur les causes du turnover, on pourra donc partir des facteurs qui vous ont parlé et regarder ensemble lesquels comptent vraiment chez vous, et le modèle Turnover vous montre déjà à quoi ressemble ce travail une fois mis en réseau.",
      liens: [
        { texte: 'Explorer le modèle Turnover', href: '/modeles/turnover' },
        { texte: "D'où viennent les ratios de coût du turnover", href: '/articles/cout-turnover-ratios' }
      ]
    },
    'burnout': {
      libelle: 'le modèle Burn-out & RPS',
      href: '/modeles/burnout',
      avant: "Vous arrivez du modèle Burn-out & RPS. Si vous disposez d'une évaluation des risques psychosociaux, d'un DUERP ou d'une enquête QVCT récente, gardez-la en tête pour l'échange, elle aide à situer votre point de départ.",
      apres: "Puisque vous venez du modèle Burn-out & RPS, on pourra partir de ce que vous savez déjà de vos risques psychosociaux, évaluation, DUERP ou enquête récente, et voir quels leviers un modèle permettrait de hiérarchiser chez vous.",
      liens: [
        { texte: 'Revoir le modèle Burn-out & RPS', href: '/modeles/burnout' },
        { texte: 'Comment les modèles sont construits', href: '/methode' }
      ]
    },
    'modeles': {
      libelle: 'la page Modèles',
      href: '/modeles/',
      avant: "Vous arrivez de la page Modèles. Si l'un des sujets présentés ressemble à votre situation, ou si votre question n'y figure pas encore, dites-le en une ligne dans le champ de notes.",
      apres: "Vous venez de la page Modèles, on pourra donc partir de celui qui se rapproche le plus de votre situation, ou d'une question qui n'y figure pas encore, c'est souvent comme ça que naissent les modèles les plus utiles.",
      liens: [
        { texte: 'Comment les modèles sont construits', href: '/methode' },
        { texte: 'Les questions fréquentes', href: '/faq' }
      ]
    },
    'methode': {
      libelle: 'la page Méthode',
      href: '/methode',
      avant: "Vous arrivez de la page Méthode. Si une étape vous pose question, les données, la calibration ou la restitution, c'est un bon sujet pour commencer.",
      apres: "Comme vous venez de la page Méthode, si une étape vous a laissé une question, données, calibration ou restitution, on commencera par là.",
      liens: [
        { texte: 'Voir les modèles en action', href: '/modeles/' },
        { texte: 'Les questions fréquentes', href: '/faq' }
      ]
    },
    'articles': {
      libelle: 'les articles',
      href: '/articles',
      avant: "Vous arrivez des articles. Si l'un d'eux fait écho à une situation chez vous, notez-le, on pourra s'en servir comme point de départ.",
      apres: "Vous venez des articles, si l'un d'eux fait écho à votre situation on pourra s'en servir comme point de départ, et les modèles montrent à quoi ressemble ce raisonnement une fois rendu interrogeable.",
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    },
    'decryptages': {
      libelle: 'les décryptages',
      href: '/decryptages',
      avant: "Vous arrivez des décryptages. Si un texte ou une réglementation vous occupe en ce moment, notez-le en une ligne, on partira de là.",
      apres: "Vous venez des décryptages, si un texte ou une réglementation vous occupe en ce moment on partira de là pour voir ce qu'une modélisation peut clarifier.",
      liens: [
        { texte: 'Le décryptage AI Act', href: '/decryptages/ai-act/' },
        { texte: 'Explorer les modèles', href: '/modeles/' }
      ]
    },
    'faq': {
      libelle: 'la FAQ',
      href: '/faq',
      avant: "Vous arrivez de la FAQ. Si une question n'y trouvait pas sa réponse, c'est un très bon début d'échange.",
      apres: "Vous venez de la FAQ, si une question n'y trouvait pas sa réponse gardez-la pour notre échange, on commencera par elle.",
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    },
    'a-propos': {
      libelle: 'la page À propos',
      href: '/a-propos',
      avant: null,
      apres: null,
      liens: [
        { texte: 'Explorer les modèles', href: '/modeles/' },
        { texte: 'Comprendre la méthode', href: '/methode' }
      ]
    }
  };

  // Chemin de la page précédente -> clé (premier motif qui correspond)
  var CHEMINS = [
    [/^\/decryptages\/ai-act/, 'ai-act'],
    [/^\/decryptages/, 'decryptages'],
    [/^\/modeles\/turnover/, 'turnover'],
    [/^\/modeles\/burnout/, 'burnout'],
    [/^\/modeles/, 'modeles'],
    [/^\/articles\/causes-turnover/, 'article-turnover'],
    [/^\/articles\/cout-turnover/, 'turnover'],
    [/^\/articles/, 'articles'],
    [/^\/methode/, 'methode'],
    [/^\/faq/, 'faq'],
    [/^\/a-propos/, 'a-propos']
  ];

  function depuisReferrer() {
    try {
      if (!document.referrer) return null;
      var r = new URL(document.referrer);
      if (r.host !== location.host) return null;
      // la page contact transmet déjà son propre ?sujet=
      var s = r.searchParams.get('sujet');
      if (s) return s;
      var chemin = r.pathname.replace(/\.html$/, '');
      for (var i = 0; i < CHEMINS.length; i++) {
        if (CHEMINS[i][0].test(chemin)) return CHEMINS[i][1];
      }
    } catch (e) {}
    return null;
  }

  window.nmSujets = SUJETS;
  window.nmProvenance = function () {
    var cle = null, source = null;
    try { cle = new URLSearchParams(location.search).get('sujet'); } catch (e) {}
    if (cle) { source = 'lien'; }
    else { cle = depuisReferrer(); if (cle) source = 'navigation'; }
    if (cle) cle = String(cle).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || null;
    return { cle: cle, source: cle ? source : null, info: cle ? (SUJETS[cle] || null) : null };
  };
})();
