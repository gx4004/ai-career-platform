import { useState } from 'react'
import { Bookmark, Briefcase } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/kit'
import { GallerySection, Group, Specimen } from './gallery-parts'

function ApplicationsTabs() {
  const [value, setValue] = useState('active')
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList aria-label="Applications">
        <TabsTrigger value="active" count={7}>
          Active
        </TabsTrigger>
        <TabsTrigger value="saved" count={12}>
          Saved
        </TabsTrigger>
        <TabsTrigger value="closed" count={0}>
          Closed
        </TabsTrigger>
        <TabsTrigger value="archive" disabled>
          Archive
        </TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="kit-gallery__paragraph">Seven applications in progress. Arrow keys move between the tabs and open them.</p>
      </TabsContent>
      <TabsContent value="saved">
        <p className="kit-gallery__paragraph">Twelve saved jobs you have not applied to yet.</p>
      </TabsContent>
      <TabsContent value="closed">
        <p className="kit-gallery__paragraph">Nothing closed yet.</p>
      </TabsContent>
    </Tabs>
  )
}

export function TabsSection() {
  return (
    <GallerySection
      id="tabs"
      title="Tabs"
      note="Folder tabs: the row overlaps the white panel by 2px and the selected tab opens into it. Hover (fine pointer) tints an unselected tab lemon-soft. Left and Right arrows move and open, Home and End jump, Tab goes into the panel. The count is a lemon pill and part of the tab's name. A list wider than its container scrolls sideways. variant=plain drops the panel for tabs whose content is page sections."
    >
      <Group title="With counts and a disabled tab">
        <ApplicationsTabs />
      </Group>

      <Group title="Sign-in tabs, with icons, plain, and overflowing a narrow container">
        <div className="kit-gallery__grid">
          <Specimen label="folder (default)">
            <Tabs defaultValue="sign-in">
              <TabsList aria-label="Account">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="create">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="sign-in">
                <p className="kit-gallery__paragraph">Sign in with your email.</p>
              </TabsContent>
              <TabsContent value="create">
                <p className="kit-gallery__paragraph">Create an account to keep your progress.</p>
              </TabsContent>
            </Tabs>
          </Specimen>
          <Specimen label="icons">
            <Tabs defaultValue="jobs">
              <TabsList aria-label="Collections">
                <TabsTrigger value="jobs" icon={<Briefcase aria-hidden="true" />}>
                  Jobs
                </TabsTrigger>
                <TabsTrigger value="saved" icon={<Bookmark aria-hidden="true" />} count={3}>
                  Saved
                </TabsTrigger>
              </TabsList>
              <TabsContent value="jobs">
                <p className="kit-gallery__paragraph">All jobs.</p>
              </TabsContent>
              <TabsContent value="saved">
                <p className="kit-gallery__paragraph">Saved jobs.</p>
              </TabsContent>
            </Tabs>
          </Specimen>
          <Specimen label="variant plain: no panel">
            <Tabs defaultValue="all" variant="plain">
              <TabsList aria-label="Filter">
                <TabsTrigger value="all" count={9}>
                  All
                </TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
              </TabsList>
              <TabsContent value="all">
                <p className="kit-gallery__paragraph">The content sits bare on the page under a 2px rule.</p>
              </TabsContent>
              <TabsContent value="open">
                <p className="kit-gallery__paragraph">Open ones.</p>
              </TabsContent>
            </Tabs>
          </Specimen>
          <Specimen label="narrow container (16rem)">
            <div className="kit-gallery__bounded kit-gallery__narrow-tabs">
              <Tabs defaultValue="c">
                <TabsList aria-label="Tools">
                  {['Resume', 'Match', 'Career', 'Letter', 'Interview', 'Portfolio'].map((name) => (
                    <TabsTrigger key={name} value={name.charAt(0).toLowerCase()}>
                      {name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="c">
                  <p className="kit-gallery__paragraph">Career path.</p>
                </TabsContent>
              </Tabs>
            </div>
          </Specimen>
        </div>
      </Group>
    </GallerySection>
  )
}
