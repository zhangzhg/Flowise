import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import PropTypes from 'prop-types'

// material-ui
import { Card, CardContent, Chip, Stack } from '@mui/material'
import { useTheme, styled } from '@mui/material/styles'

// project imports
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'

// icons
import { IconRobotFace, IconBrandOpenai } from '@tabler/icons-react'

const createCards = (t) => [
    {
        title: t('assistants.customAssistant'),
        description: t('assistants.customAssistantDesc'),
        icon: <IconRobotFace />,
        iconText: 'Custom',
        gradient: 'linear-gradient(135deg, #fff8e14e 0%, #ffcc802f 100%)'
    },
    {
        title: t('assistants.openaiAssistant'),
        description: t('assistants.openaiAssistantDesc'),
        icon: <IconBrandOpenai />,
        iconText: 'OpenAI',
        gradient: 'linear-gradient(135deg, #c9ffd85f 0%, #a0f0b567 100%)',
        deprecating: true
    }
]

const StyledCard = styled(Card)(({ gradient }) => ({
    height: '300px',
    background: gradient,
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
    cursor: 'pointer'
}))

const FeatureIcon = styled('div')(() => ({
    display: 'inline-flex',
    padding: '4px 8px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: '4px',
    marginBottom: '16px',
    '& svg': {
        width: '1.2rem',
        height: '1.2rem',
        marginRight: '8px'
    }
}))

const FeatureCards = ({ t }) => {
    const navigate = useNavigate()
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const cards = createCards(t)

    const onCardClick = (index) => {
        if (index === 0) navigate('/assistants/custom')
        if (index === 1) navigate('/assistants/openai')
    }

    return (
        <Stack
            spacing={3}
            direction='row'
            sx={{
                width: '100%',
                justifyContent: 'space-between'
            }}
        >
            {cards.map((card, index) => (
                <StyledCard
                    key={index}
                    gradient={card.gradient}
                    sx={{
                        flex: 1,
                        maxWidth: 'calc((100% - 16px) / 2)',
                        height: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        border: 1,
                        borderColor: theme.palette.grey[900] + 25,
                        borderRadius: 2,
                        color: customization.isDarkMode ? theme.palette.common.white : '#333333',
                        cursor: 'pointer',
                        '&:hover': {
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
                        }
                    }}
                    onClick={() => onCardClick(index)}
                >
                    <CardContent className='h-full relative z-10'>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                            <FeatureIcon>
                                {card.icon}
                                <span className='text-xs uppercase'>{card.iconText}</span>
                            </FeatureIcon>
                            {card.deprecating && (
                                <Chip label={t('assistants.deprecating')} size='small' color='warning' sx={{ fontWeight: 600 }} />
                            )}
                        </Stack>
                        <h2 className='text-2xl font-bold mb-2'>{card.title}</h2>
                        <p className='text-gray-600'>{card.description}</p>
                    </CardContent>
                </StyledCard>
            ))}
        </Stack>
    )
}

FeatureCards.propTypes = {
    t: PropTypes.func.isRequired
}

// ==============================|| ASSISTANTS ||============================== //

const Assistants = () => {
    const { t } = useTranslation()
    return (
        <>
            <MainCard>
                <Stack flexDirection='column' sx={{ gap: 3 }}>
                    <ViewHeader title={t('assistants.title')} description={t('assistants.pageDescription')} />
                    <FeatureCards t={t} />
                </Stack>
            </MainCard>
        </>
    )
}

export default Assistants
