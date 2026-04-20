import { Box, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// ==============================|| LOGO ||============================== //

const Logo = () => {
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                ml: '10px',
                userSelect: 'none',
                cursor: 'pointer',
                transition: 'transform .25s ease',
                '&:hover img': {
                    transform: 'rotate(-6deg) scale(1.05)'
                }
            }}
        >
            <Box
                component='img'
                src='/logo.svg'
                alt='Logo'
                sx={{
                    width: 40,
                    height: 40,
                    objectFit: 'contain',
                    borderRadius: '10px',
                    filter: isDark ? 'drop-shadow(0 0 8px rgba(96,165,250,0.45))' : 'drop-shadow(0 2px 6px rgba(34,150,243,0.25))',
                    transition: 'transform .25s ease, filter .25s ease'
                }}
            />
            <Typography
                component='span'
                sx={{
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '1px',
                    whiteSpace: 'nowrap',
                    mr: 2,
                    background: isDark
                        ? 'linear-gradient(90deg, #e2e8f0 0%, #60a5fa 100%)'
                        : 'linear-gradient(90deg, #1e293b 0%, #2296f3 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}
            >
                智能体流程编排平台
            </Typography>
        </Box>
    )
}

export default Logo
