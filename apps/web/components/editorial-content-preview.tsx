import type { ArticleContent } from "@platform/website-engine";

export function EditorialContentPreview({ content }: { content: ArticleContent }) {
  return <div className="editorial-content-preview">
    {content.blocks.map((block, index) => {
      if (block.type === "heading") return block.level === 2 ? <h2 key={index}>{block.text}</h2> : <h3 key={index}>{block.text}</h3>;
      if (block.type === "quote") return <blockquote key={index}>{block.text}{block.attribution ? <cite>{block.attribution}</cite> : null}</blockquote>;
      if (block.type === "list") return block.style === "ordered" ? <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol> : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
      return <p key={index}>{block.text}</p>;
    })}
  </div>;
}
