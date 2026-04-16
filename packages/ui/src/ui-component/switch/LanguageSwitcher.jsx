import { useTranslation } from 'react-i18next'
import { IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconLanguage } from '@tabler/icons-react'
import { useState } from 'react'

const languages = [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'zh', label: 'Chinese', nativeLabel: '中文' }
]

const LanguageSwitcher = () => {
    const { i18n } = useTranslation()
    const theme = useTheme()
    const [anchorEl, setAnchorEl] = useState(null)

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorEl(null)
    }

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng)
        handleClose()
    }

    const currentLang = languages.find((l) => l.code === i18n.language?.substring(0, 2)) || languages[0]

    return (
        <>
            <IconButton
                onClick={handleClick}
                size='small'
                sx={{
                    ml: 1,
                    color: theme.palette.text.primary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5
                }}
            >
                <IconLanguage size={20} />
                <Typography variant='caption' sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                    {currentLang.nativeLabel}
                </Typography>
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 1,
                            minWidth: 140
                        }
                    }
                }}
            >
                {languages.map((lang) => (
                    <MenuItem
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        selected={i18n.language?.substring(0, 2) === lang.code}
                        sx={{ display: 'flex', justifyContent: 'space-between' }}
                    >
                        <Typography variant='body2'>{lang.nativeLabel}</Typography>
                        <Typography variant='caption' sx={{ color: theme.palette.text.secondary, ml: 2 }}>
                            {lang.label}
                        </Typography>
                    </MenuItem>
                ))}
            </Menu>
        </>
    )
}

export default LanguageSwitcher
