import * as React from 'react'

import { Hr, Text } from '@react-email/components'

export const BRAND_FOOTER_TEXT = 'ChAi by Dominion Agency · askchai.tech'

export const BrandFooter = () => (
  <>
    <Hr style={rule} />
    <Text style={brandFooter}>{BRAND_FOOTER_TEXT}</Text>
  </>
)

export default BrandFooter

const rule = { borderColor: '#E3E8EE', margin: '32px 0 16px' }
const brandFooter = {
  fontSize: '12px',
  color: '#8A96A3',
  margin: '0',
}
