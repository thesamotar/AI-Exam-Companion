import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface MathRendererProps {
  text: string
}

function cleanFormula(formula: string): string {
  return formula
    .replace(/\r(?=[a-zA-Z])/g, '\\r')
    .replace(/\n(?=[a-zA-Z])/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\b/g, '\\b')
}

export default function MathRenderer({ text }: MathRendererProps) {
  if (!text) return null

  // Split by block math first: $$ ... $$
  const blockParts = text.split(/(\$\$[\s\S]*?\$\$)/g)

  return (
    <span>
      {blockParts.map((blockPart, i) => {
        if (blockPart.startsWith('$$') && blockPart.endsWith('$$')) {
          const formula = cleanFormula(blockPart.slice(2, -2))
          try {
            const html = katex.renderToString(formula, { displayMode: true, throwOnError: false })
            return (
              <span
                key={i}
                dangerouslySetInnerHTML={{ __html: html }}
                className="block my-4 overflow-x-auto text-center"
              />
            )
          } catch (err) {
            console.error('KaTeX block error:', err)
            return (
              <span key={i} className="text-rose-400 block font-mono text-xs my-2">
                {blockPart}
              </span>
            )
          }
        }

        // Split by inline math: $ ... $
        const inlineParts = blockPart.split(/(\$.*?\$)/g)
        return (
          <span key={i}>
            {inlineParts.map((inlinePart, j) => {
              if (inlinePart.startsWith('$') && inlinePart.endsWith('$')) {
                const formula = cleanFormula(inlinePart.slice(1, -1))
                try {
                  const html = katex.renderToString(formula, { displayMode: false, throwOnError: false })
                  return (
                    <span
                      key={j}
                      dangerouslySetInnerHTML={{ __html: html }}
                      className="inline-block mx-0.5 align-middle"
                    />
                  )
                } catch (err) {
                  console.error('KaTeX inline error:', err)
                  return (
                    <span key={j} className="text-rose-400 font-mono text-xs">
                      {inlinePart}
                    </span>
                  )
                }
              }
              if (inlinePart.includes('**')) {
                const boldParts = inlinePart.split(/(\*\*.*?\*\*)/g)
                return (
                  <React.Fragment key={j}>
                    {boldParts.map((part, k) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={k} className="font-bold text-slate-100">{part.slice(2, -2)}</strong>
                      }
                      return part
                    })}
                  </React.Fragment>
                )
              }
              return <React.Fragment key={j}>{inlinePart}</React.Fragment>
            })}
          </span>
        )
      })}
    </span>
  )
}
