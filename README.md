# Without Loss of General (Audience)

Experience WLOGA at https://wloga.xyz/

Thank you to mango bird, who asked about accessible arXiv categories at https://www.reddit.com/r/math/comments/1ro77je/most_accessible_arxiv_categories/ and inspired this idea.

And thank you to arXiv for use of its open access interoperability!

## What is this?

**Without Loss of General (Audience)** is a curated feed of mathematics preprints from the [arXiv](https://arxiv.org/) math listings — filtered for papers that a broader audience might enjoy.

Every day, hundreds of new math papers appear on arXiv. It's great! This is an incredible resource of deep technical work written for specialists. But hiding among those are papers with:

- elementary statements of results,
- accessible introductions,
- connections to well-known problems a broader audience is interested in, and
- proofs that rely more on ideas than machinery

There's no super easy way to discover some broadly accessible gems unless you're not already embedded in the right research community.

My hope is that WLOGA finds those papers! Let's get more people engaging with math!

## The Filter

Papers are evaluated for accessibility. Could someone who has taken real analysis or abstract algebra read this with reasonable effort? This might mean:

- Can the main result be stated without heavy prerequisites?
- Does the introduction provide some interesting intuition?

My hope is that a lot of people might be interested in this. A software engineer who loved their algorithms course! Or a graduate student who is curious what their friends in the math department might like! Or a math professor in analysis who wants to stay loosely connected to what's happening in popular mathematics! High school students! Math is for everybody.

## Personalized Rankings

Beyond the curated feed, WLOGA lets you train a personal preference model. Visit the **Train** page and you'll be shown pairs of papers — click the one that interests you more. After a few dozen comparisons, the site learns what you like.

Under the hood, each paper has a 128-dimensional embedding (from [Qwen3-Embedding](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), truncated via Matryoshka representation). Your preferences fit a weight vector using Bradley-Terry logistic regression: the model learns which directions in embedding space correspond to "papers you'd enjoy." New papers get scored instantly, no retraining needed.

Your model lives in localStorage, so it persists across visits. The **For You** page ranks all papers by your learned preferences — even papers you've never seen get ranked by how similar they are to ones you liked.

The system uses active learning to pick informative pairs: early on it shows diverse papers to explore the space; later it focuses on pairs where your model is uncertain, squeezing maximum signal from each click.

## What's with the name?

"Without loss of generality" is a phrase that pops up in proofs: it signals *"I'm going to simplify the setup, and the interesting content survives that simplification."*

So WLOGA is punning on this: we're doing the same thing to the audience! We're selecting papers where the mathematical content survives the removal of the specialist prerequisite layer. The interesting ideas can be presented *without loss of general audience.*

## What This Site Is Not

Papers are not summarized or rewritten. You get the abstract and a link to the original.

Inclusion just means this paper seemed accessible. It is not a claim that this is the most important paper of the day or even that it is correct!

Many good, accessible papers will be missed. We're trying to automate the un-automate-able.

## Contributing

Bug reports, false positives (papers that slipped through but shouldn't have), and false negatives (accessible papers that were missed) are welcome.
