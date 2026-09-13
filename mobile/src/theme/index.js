// Warm parchment palette — mirrors web CSS variables
export const Colors = {
  bg:         '#e8e0d0',
  bg2:        '#e0d8c6',
  bg3:        '#d8cfbc',
  surface:    '#f2ede4',
  surface2:   '#faf6f0',
  surface3:   '#ffffff',

  border:     'rgba(120,100,70,0.13)',
  border2:    'rgba(120,100,70,0.22)',
  border3:    'rgba(120,100,70,0.35)',

  ink:        '#2c2416',
  ink2:       '#3d3220',
  ink3:       '#6b5c46',
  ink4:       '#a08c74',
  ink5:       '#c4b49e',

  gold:       '#8c6d3f',
  gold3:      '#b8913a',

  accent:     '#2f5a6e',
  accent2:    '#224455',
  accentBg:   'rgba(47,90,110,0.10)',
  accentRing: 'rgba(47,90,110,0.25)',

  red:        '#b83232',
  green:      '#2f6e4e',

  white:      '#ffffff',
  black:      '#000000',
};

export const Typography = {
  serif:  'PlayfairDisplay_400Regular',
  serifI: 'PlayfairDisplay_400Regular_Italic',
  serifB: 'PlayfairDisplay_700Bold',
  script: 'Kalam_400Regular',
  sans:   'System',
  mono:   'Courier New',
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: '#2c2416',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#2c2416',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
};
