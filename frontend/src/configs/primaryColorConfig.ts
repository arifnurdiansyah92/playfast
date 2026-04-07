export type PrimaryColorConfig = {
  name?: string
  light?: string
  main: string
  dark?: string
}

// Primary color config object
const primaryColorConfig: PrimaryColorConfig[] = [
  {
    name: 'primary-1',
    light: '#6DFFA0',
    main: '#00E676',
    dark: '#00C853'
  },
  {
    name: 'primary-2',
    light: '#5CAFF1',
    main: '#2092EC',
    dark: '#176BAC'
  },
  {
    name: 'primary-3',
    light: '#FFC25A',
    main: '#FFAB1D',
    dark: '#BA7D15'
  },
  {
    name: 'primary-4',
    light: '#F0718D',
    main: '#EB3D63',
    dark: '#AC2D48'
  },
  {
    name: 'primary-5',
    light: '#8F85F3',
    main: '#7367F0',
    dark: '#675DD8'
  }
]

export default primaryColorConfig
