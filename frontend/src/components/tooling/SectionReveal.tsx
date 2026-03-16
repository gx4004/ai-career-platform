import { type ReactNode } from 'react'
import { motion } from 'framer-motion'

export function SectionReveal({
  children,
  index = 0,
  delay = 0.2,
}: {
  children: ReactNode
  index?: number
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
