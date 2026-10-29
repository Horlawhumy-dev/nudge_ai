import { useMemo, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, radius } from '@/theme';

import { parseMarkdown, type Block, type Inline } from '../markdown';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const INDENT = 16;

function openLink(url: string) {
  // Only web links are ever produced by the parser; failing to open one is not worth a crash.
  Linking.openURL(url).catch(() => undefined);
}

/** Inline formatting as nested <Text>, so wrapping and selection behave like plain text. */
function renderInline(inlines: Inline[], keyPrefix = ''): ReactNode[] {
  return inlines.map((inline, i) => {
    const key = `${keyPrefix}${i}`;
    switch (inline.type) {
      case 'text':
        return inline.text;
      case 'bold':
        return (
          <RNText key={key} style={styles.bold}>
            {renderInline(inline.children, `${key}.`)}
          </RNText>
        );
      case 'italic':
        return (
          <RNText key={key} style={styles.italic}>
            {renderInline(inline.children, `${key}.`)}
          </RNText>
        );
      case 'code':
        return (
          <RNText key={key} style={styles.inlineCode}>
            {inline.text}
          </RNText>
        );
      case 'link':
        return (
          <RNText
            key={key}
            style={styles.link}
            accessibilityRole="link"
            onPress={() => openLink(inline.url)}
          >
            {inline.label}
          </RNText>
        );
    }
  });
}

function BlockView({ block, gap, color }: { block: Block; gap: number; color?: string }) {
  const spacing = { marginTop: gap };
  switch (block.type) {
    case 'paragraph':
      return (
        <Text variant="bodyLarge" color={color} selectable style={[styles.body, spacing]}>
          {renderInline(block.inlines)}
        </Text>
      );
    case 'heading':
      return (
        <Text variant="bodyLarge" color={color} selectable style={[styles.heading, spacing]}>
          {renderInline(block.inlines)}
        </Text>
      );
    case 'bullet':
    case 'ordered': {
      const marker = block.type === 'bullet' ? '•' : `${block.number}.`;
      return (
        <View style={[styles.item, spacing, { paddingLeft: block.depth * INDENT }]}>
          <Text
            variant="bodyLarge"
            color={block.type === 'bullet' ? colors.primary : color}
            style={[styles.marker, block.type === 'ordered' && styles.orderedMarker]}
          >
            {marker}
          </Text>
          <Text variant="bodyLarge" color={color} selectable style={[styles.body, styles.itemText]}>
            {renderInline(block.inlines)}
          </Text>
        </View>
      );
    }
    case 'code':
      return (
        <View style={[styles.codeBlock, spacing]}>
          <RNText selectable style={styles.codeText}>
            {block.text}
          </RNText>
        </View>
      );
  }
}

const isListItem = (b: Block) => b.type === 'bullet' || b.type === 'ordered';

/**
 * An assistant reply with its formatting applied: bold, lists, headings and code instead of the
 * raw `**` and `-` the model wrote. Plain text renders exactly as before.
 */
export function ChatMarkdown({ text, color }: { text: string; color?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View>
      {blocks.map((block, i) => {
        const previous = blocks[i - 1];
        // List items sit close together; everything else gets a paragraph's breathing room.
        const gap = !previous ? 0 : isListItem(previous) && isListItem(block) ? 4 : 10;
        return <BlockView key={i} block={block} gap={gap} color={color} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 25 },
  bold: { fontFamily: fonts.bodySemiBold },
  italic: { fontStyle: 'italic' },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  inlineCode: { fontFamily: MONO, backgroundColor: colors.surfaceMuted, fontSize: 14 },
  heading: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 24 },
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  marker: { width: 18, lineHeight: 25 },
  orderedMarker: { width: 24 },
  itemText: { flex: 1 },
  codeBlock: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 19, color: colors.text },
});
