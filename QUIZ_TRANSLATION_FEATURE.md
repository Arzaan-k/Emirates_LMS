# Quiz Translation Feature

## Overview
The Quiz Translation feature allows users to take quizzes in their preferred language while maintaining compatibility with the original English quiz answers. This feature uses Groq AI to translate quiz questions and options in real-time, with intelligent caching to optimize performance.

## Key Features

### 1. **Multi-Language Support**
- **Supported Languages**: English, Hindi (हिन्दी), Spanish (Español), French (Français)
- Can be easily extended to support more languages

### 2. **Smart Translation**
- **What Gets Translated**:
  - Quiz title
  - Quiz description
  - Question text
  - All answer options
  - Explanations (if present)

- **What Stays Original**:
  - Answer indices (so submissions work correctly)
  - Quiz ID
  - Scoring logic
  - Correct answer mappings

### 3. **Performance Optimization**
- **1-Hour Cache**: Translated quizzes are cached for 1 hour to avoid repeated API calls
- **Background Translation**: Quiz translates asynchronously while user can still interact
- **Fallback Mechanism**: If translation fails, original quiz is shown

### 4. **User Experience**
- **Language Selector**: Translate icon button in quiz header
- **Visual Feedback**: Loading indicator while translating
- **Persistent Selection**: Language stays selected throughout the quiz
- **No Impact on Scoring**: Answers are always submitted using original indices

## Architecture

### Backend Implementation

#### 1. Translation Cache (`quizzes.py`)
```python
# In-memory cache for translated quizzes
_quiz_translation_cache = {}
TRANSLATION_CACHE_TTL = 3600  # 1 hour
```

#### 2. API Endpoints

**GET `/api/v1/quizzes/{quiz_id}?language=<language>`**
- Returns quiz with optional translation
- Example: `/api/v1/quizzes/quiz_123?language=Hindi`

**GET `/api/v1/quizzes/{quiz_id}/translate?language=<language>`**
- Dedicated translation endpoint
- Returns translated quiz with metadata

#### 3. Translation Function
```python
async def translate_quiz(quiz_dict: Dict[str, Any], target_language: str) -> Dict[str, Any]:
    """
    Translates quiz using Groq AI with intelligent caching
    - Checks cache first
    - Translates title, description, questions, and options
    - Handles both string and object-based options
    - Returns original quiz if translation fails
    """
```

### Frontend Implementation

#### 1. QuizTakingModal Component

**New State Variables**:
```javascript
const [selectedLanguage, setSelectedLanguage] = useState('en');
const [translatedQuiz, setTranslatedQuiz] = useState(null);
const [isTranslating, setIsTranslating] = useState(false);
const [showLanguageMenu, setShowLanguageMenu] = useState(false);
```

**Key Functions**:
- `fetchTranslatedQuiz(language)`: Fetches translated quiz from API
- `handleLanguageChange(langCode)`: Changes quiz language
- Uses `displayQuiz` = `translatedQuiz || quiz` throughout

#### 2. UI Components Added

**Language Selector Button**:
- Translate icon in header (MaterialIcons "translate")
- Positioned next to question counter
- Opens dropdown menu on click

**Language Dropdown Menu**:
- Shows all available languages
- Visual indicator for selected language
- Checkmark for current selection

**Translation Indicator**:
- Shows "Translating quiz..." with spinner
- Appears while fetching translation
- Prevents user interaction during translation

## How It Works

### Translation Flow

1. **User Opens Quiz**
   - Quiz loads in English (default)
   - Language selector visible in header

2. **User Selects Language**
   - User clicks translate icon
   - Selects desired language from dropdown
   - Frontend fetches translated quiz from API

3. **Backend Processing**
   - Checks cache for existing translation
   - If cached: Returns immediately
   - If not cached: Translates using Groq AI
   - Caches result for 1 hour

4. **Display Translation**
   - UI updates to show translated content
   - Original quiz structure maintained
   - User can answer questions in translated language

5. **Submission**
   - Answers submitted using **original quiz ID**
   - Answer indices remain unchanged
   - Backend scores using original quiz
   - **Translation has zero impact on scoring**

### Supported Quiz Types

This feature works with:
- ✅ **Standard Quizzes** (assessment quizzes)
- ✅ **Live Quizzes** (live topic quizzes)
- ⚠️ **Daily Quizzes** (can be added with similar integration)
- ⚠️ **Embedded Course Quizzes** (can be added with similar integration)

## Code Changes

### Backend Files Modified
1. **`backend/app/api/v1/endpoints/quizzes.py`**
   - Added translation cache
   - Modified `get_quiz()` endpoint to accept `language` parameter
   - Added `get_translated_quiz()` endpoint
   - Added `translate_quiz()` helper function

### Frontend Files Modified
1. **`Components/QuizTakingModal.js`**
   - Added language selector UI
   - Implemented translation fetching logic
   - Added translation loading states
   - Updated to use `displayQuiz` throughout

### Dependencies Used
- **Backend**: Groq AI (`AIService.translate_text()`)
- **Frontend**: MaterialIcons for translate icon

## Usage Examples

### For Users (Frontend)

```javascript
// In QuizTakingModal
<QuizTakingModal
    visible={showQuiz}
    quiz={selectedQuiz}
    onClose={() => setShowQuiz(false)}
    userName={userName}
/>
// User can now click translate icon and select language
```

### For API Consumers

```bash
# Get quiz in Hindi
GET /api/v1/quizzes/quiz_123?language=Hindi

# Get quiz in Spanish
GET /api/v1/quizzes/quiz_123?language=Spanish

# Get quiz in original language (English)
GET /api/v1/quizzes/quiz_123
```

### For Other Components

To add translation to other quiz components:

```javascript
// 1. Import required dependencies
import { MaterialIcons } from '@expo/vector-icons';

// 2. Add state variables
const [selectedLanguage, setSelectedLanguage] = useState('en');
const [translatedQuiz, setTranslatedQuiz] = useState(null);
const [isTranslating, setIsTranslating] = useState(false);

// 3. Fetch translated quiz
const fetchTranslatedQuiz = async (language) => {
    if (language === 'en') {
        setTranslatedQuiz(null);
        return;
    }

    setIsTranslating(true);
    try {
        const languageMap = { 'hi': 'Hindi', 'es': 'Spanish', 'fr': 'French' };
        const targetLanguage = languageMap[language] || 'Hindi';
        const response = await fetch(
            `${API_URL}/api/v1/quizzes/${quiz.id}?language=${targetLanguage}`
        );
        if (response.ok) {
            const translated = await response.json();
            setTranslatedQuiz(translated);
        }
    } catch (error) {
        console.error('Translation error:', error);
    } finally {
        setIsTranslating(false);
    }
};

// 4. Use displayQuiz throughout
const displayQuiz = translatedQuiz || quiz;

// 5. Render using displayQuiz
<Text>{displayQuiz.title}</Text>
<Text>{displayQuiz.questions[index].question}</Text>
```

## Performance Considerations

### Cache Strategy
- **Cache Duration**: 1 hour (3600 seconds)
- **Cache Key**: MD5 hash of `{quiz_id}-{language}`
- **Cache Location**: In-memory (backend)
- **Cache Invalidation**: Automatic after TTL expiration

### Optimization Tips
1. **Cache is shared**: All users benefit from cached translations
2. **First request is slow**: ~5-10 seconds for full translation
3. **Subsequent requests**: Instant (cache hit)
4. **Network efficient**: Only translates once per quiz per language

### Scaling Considerations
- For production, consider using Redis for distributed caching
- Monitor Groq API rate limits
- Consider pre-translating popular quizzes during off-peak hours

## Error Handling

### Translation Failures
```python
except Exception as e:
    logger.error(f"Error translating quiz: {e}")
    # Return original quiz if translation fails
    return quiz_dict
```

### Network Failures (Frontend)
```javascript
catch (error) {
    console.error('Error fetching translated quiz:', error);
    setTranslatedQuiz(null);  // Fall back to original
}
```

### User Impact
- **Graceful Degradation**: Always falls back to original English quiz
- **No Interruption**: Quiz remains playable even if translation fails
- **Clear Feedback**: Loading indicators show translation status

## Testing

### Manual Testing Checklist
- [ ] Select Hindi language - verify questions translate
- [ ] Select Spanish language - verify questions translate
- [ ] Select French language - verify questions translate
- [ ] Submit quiz after translation - verify scoring works
- [ ] Change language mid-quiz - verify translation updates
- [ ] Test with slow network - verify loading indicators
- [ ] Test translation failure - verify fallback to English
- [ ] Test cache - verify second request is instant
- [ ] Test different quiz types (standard, live)

### API Testing
```bash
# Test translation endpoint
curl "http://localhost:8000/api/v1/quizzes/quiz_123?language=Hindi"

# Test caching
curl "http://localhost:8000/api/v1/quizzes/quiz_123/translate?language=Hindi"
# Call again immediately - should be instant
```

## Future Enhancements

### Potential Improvements
1. **Language Persistence**: Save user's language preference
2. **More Languages**: Add support for more languages (German, Portuguese, etc.)
3. **Voice Translation**: Add text-to-speech for translated questions
4. **Offline Mode**: Pre-download translated quizzes for offline use
5. **Admin Pre-Translation**: Allow admins to pre-translate quizzes
6. **Translation Quality**: Add manual review/editing of AI translations
7. **Regional Dialects**: Support regional variations (e.g., Latin American vs European Spanish)

### Integration Points
- **DailyQuizTab**: Add translation similar to QuizTakingModal
- **QuizScreen**: Add translation for embedded course quizzes
- **Live Quiz Modal**: Ensure translation works for real-time quizzes
- **Quiz Results**: Translate feedback and explanations

## Troubleshooting

### Common Issues

**Issue**: Translation is slow on first request
- **Expected**: First translation takes ~5-10 seconds
- **Solution**: Use loading indicator (already implemented)

**Issue**: Translation returns original English
- **Cause**: Groq API error or rate limit
- **Check**: Backend logs for translation errors
- **Solution**: Verify Groq API key and rate limits

**Issue**: Answers not scoring correctly
- **Cause**: Answer indices might be modified
- **Check**: Ensure using original quiz ID for submission
- **Solution**: Always use `quiz.id` (not `displayQuiz.id`)

**Issue**: Cache not working
- **Cause**: In-memory cache cleared on server restart
- **Solution**: Consider persistent cache (Redis) for production

## Configuration

### Environment Variables
```bash
# Required for translation
GROQ_API_KEY=your_groq_api_key_here

# Optional - customize cache duration
QUIZ_TRANSLATION_CACHE_TTL=3600  # 1 hour in seconds
```

### Language Configuration
To add new languages:

1. **Backend** (`quizzes.py`): No changes needed - language passed as parameter

2. **Frontend** (`QuizTakingModal.js`):
```javascript
const QUIZ_LANGUAGES = {
    en: "English",
    hi: "हिन्दी (Hindi)",
    es: "Español (Spanish)",
    fr: "Français (French)",
    de: "Deutsch (German)",      // Add new language
    pt: "Português (Portuguese)", // Add new language
};

// Update language map in fetchTranslatedQuiz
const languageMap = {
    'hi': 'Hindi',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',      // Add mapping
    'pt': 'Portuguese'   // Add mapping
};
```

## Summary

The Quiz Translation feature provides a seamless multilingual quiz experience:

✅ **User-Friendly**: Simple language selector, instant translation
✅ **Performance**: 1-hour caching ensures fast subsequent requests
✅ **Reliable**: Graceful fallback to English on errors
✅ **Compatible**: No impact on quiz submission or scoring
✅ **Extensible**: Easy to add new languages and quiz types

This feature enhances accessibility and allows users to learn in their preferred language while maintaining the integrity of the quiz system.
