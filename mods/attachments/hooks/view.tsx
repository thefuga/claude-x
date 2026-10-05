import type { Elements } from 'claude-code'

import type { Chip } from '../types'
import { GLYPHS, theme } from './theme'

type Parts = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

// The draft's attachments as chips in a row that wraps, in the order they stand in the draft:
// each the glyph of its type, its path, its facts and a × that takes it out of the draft.
export const Chips = ({ Box, Text, Button }: Parts, chips: readonly Chip[], onRemove: (chip: Chip) => void) => (
  <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
    {chips.map(chip => (
      <Box key={`chip:${chip.at}`} flexDirection="row" columnGap={1} paddingX={1} backgroundColor={theme.chip}>
        <Text color={theme.glyphs[chip.type]}>{GLYPHS[chip.type]}</Text>
        <Text>{chip.name}</Text>
        {chip.facts.length === 0 ? null : <Text dimColor>{chip.facts.join(' · ')}</Text>}
        <Button key={`remove:${chip.at}`} plain dimColor onPress={() => onRemove(chip)}>
          ×
        </Button>
      </Box>
    ))}
  </Box>
)
