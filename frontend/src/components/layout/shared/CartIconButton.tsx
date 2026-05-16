'use client'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'

import IconButton from '@mui/material/IconButton'
import Badge from '@mui/material/Badge'
import Tooltip from '@mui/material/Tooltip'

import { cartApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const CartIconButton = () => {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
    staleTime: 30000,
  })

  if (!user) return null

  const count = data?.item_count || 0

  return (
    <Tooltip title='Keranjang'>
      <IconButton
        component={Link}
        href='/cart'
        size='medium'
        aria-label={count > 0 ? `Keranjang (${count} item)` : 'Keranjang'}
      >
        <Badge
          badgeContent={count}
          color='warning'
          overlap='circular'
          invisible={count === 0}
          sx={{
            '& .MuiBadge-badge': {
              fontSize: 10,
              fontWeight: 700,
              minWidth: 18,
              height: 18,
              bgcolor: '#c9a84c',
              color: '#000',
            },
          }}
        >
          <i className='tabler-shopping-cart' />
        </Badge>
      </IconButton>
    </Tooltip>
  )
}

export default CartIconButton
