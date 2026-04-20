package taxonomy

type Domain struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Topics  []string `json:"topics,omitempty"`
	Parents []string `json:"parents,omitempty"`
}

var All = []Domain{
	{ID: "ai", Name: "Artificial Intelligence", Topics: []string{"llm", "agents", "machine learning", "neural networks", "automation"}},
	{ID: "technology", Name: "Technology", Topics: []string{"software", "hardware", "internet", "computing", "data"}},
	{ID: "philosophy", Name: "Philosophy", Topics: []string{"meaning", "ethics", "epistemology", "metaphysics", "logic"}},
	{ID: "politics", Name: "Politics", Topics: []string{"government", "policy", "democracy", "power", "institutions"}},
	{ID: "economics", Name: "Economics", Topics: []string{"markets", "capitalism", "labor", "growth", "trade"}},
	{ID: "culture", Name: "Culture", Topics: []string{"society", "norms", "values", "identity", "community"}},
	{ID: "science", Name: "Science", Topics: []string{"research", "method", "physics", "biology", "experiments"}},
	{ID: "history", Name: "History", Topics: []string{"past", "events", "civilization", "eras", "archives"}},
	{ID: "design", Name: "Design", Topics: []string{"ux", "visual", "typography", "product design", "systems"}},
	{ID: "business", Name: "Business", Topics: []string{"startups", "strategy", "operations", "finance", "leadership"}},
	{ID: "product", Name: "Product", Topics: []string{"strategy", "roadmap", "features", "metrics", "users"}},
	{ID: "engineering", Name: "Engineering", Topics: []string{"software", "architecture", "testing", "reliability", "systems"}},
	{ID: "writing", Name: "Writing", Topics: []string{"prose", "essays", "craft", "editing", "publishing"}},
	{ID: "personal", Name: "Personal", Topics: []string{"journal", "diary", "reflection", "life", "memoir"}},
	{ID: "health", Name: "Health", Topics: []string{"wellness", "medicine", "fitness", "mental health", "nutrition"}},
	{ID: "education", Name: "Education", Topics: []string{"learning", "teaching", "schools", "knowledge", "skills"}},
	{ID: "ethics", Name: "Ethics", Topics: []string{"morality", "values", "dilemmas", "responsibility", "virtue"}},
	{ID: "religion", Name: "Religion", Topics: []string{"faith", "spirituality", "theology", "practice", "belief"}},
	{ID: "psychology", Name: "Psychology", Topics: []string{"mind", "behavior", "cognition", "emotion", "therapy"}},
	{ID: "sociology", Name: "Sociology", Topics: []string{"society", "groups", "structures", "inequality", "institutions"}},
	{ID: "law", Name: "Law", Topics: []string{"legal", "rights", "courts", "justice", "regulation"}},
	{ID: "media", Name: "Media", Topics: []string{"journalism", "news", "publishing", "film", "entertainment"}},
	{ID: "art", Name: "Art", Topics: []string{"visual", "creative", "craft", "aesthetics", "performance"}},
	{ID: "environment", Name: "Environment", Topics: []string{"climate", "nature", "sustainability", "ecology", "conservation"}},
	{ID: "career", Name: "Career", Topics: []string{"work", "jobs", "profession", "skills", "productivity"}},
	{ID: "unclear", Name: "Unclear", Topics: []string{"undetermined", "ambiguous", "mixed topics"}},
}

var IDSet = make(map[string]Domain)

func init() {
	for _, d := range All {
		IDSet[d.ID] = d
	}
}

func MustLookup(id string) Domain {
	d, ok := IDSet[id]
	if !ok {
		return Domain{ID: "unclear", Name: "Unclear"}
	}
	return d
}

func IsValid(id string) bool {
	_, ok := IDSet[id]
	return ok
}

var DefaultTaxonomy = []string{
	"ai",
	"technology",
	"philosophy",
	"politics",
	"economics",
	"culture",
	"science",
	"history",
	"design",
	"business",
	"product",
	"engineering",
	"writing",
	"personal",
	"health",
	"education",
	"ethics",
	"religion",
	"psychology",
	"sociology",
	"law",
	"media",
	"art",
	"environment",
	"career",
	"unclear",
}
