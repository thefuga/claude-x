import type { ClientModule } from 'claude-code'

type Props = { of: number }

// Nothing to see: a strip that tells the hooks how wide the engine laid it out, with the terminal's
// width it was drawn for. Each pair is posted once.
const Measure: ClientModule<Props, string> = ({ of }, surface) => {
  const { Text } = surface.elements
  const seen = `${surface.columns}/${of}`

  if (surface.columns > 0 && surface.state !== seen) {
    surface.setState(seen)
    surface.post({ columns: surface.columns, of })
  }

  return <Text> </Text>
}

export default Measure
