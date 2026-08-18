declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '@xyflow/react/dist/style.css' {
  const content: string
  export default content
}