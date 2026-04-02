"use client"

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '#/lib/utils';

const testimonials = [
  {
    tempId: 0,
    testimonial: "Went from zero callbacks to three interviews in two weeks. The score told me exactly what to fix.",
    by: "Marcus, Software Engineer",
    imgSrc: "https://i.pravatar.cc/150?img=1"
  },
  {
    tempId: 1,
    testimonial: "I'd been applying for four months with nothing. Career Workbench showed me what everyone else could see but I couldn't.",
    by: "Priya, Career Changer",
    imgSrc: "https://i.pravatar.cc/150?img=2"
  },
  {
    tempId: 2,
    testimonial: "Cut my application time in half. Cover letter, interview prep, everything from the same upload.",
    by: "Jordan, Marketing Manager",
    imgSrc: "https://i.pravatar.cc/150?img=3"
  },
  {
    tempId: 3,
    testimonial: "My resume score went from 54 to 87. Started hearing back from companies within a week of updating it.",
    by: "Aisha, Recent Graduate",
    imgSrc: "https://i.pravatar.cc/150?img=4"
  },
  {
    tempId: 4,
    testimonial: "Best career tool I've ever used. Period.",
    by: "Daniel, Product Designer",
    imgSrc: "https://i.pravatar.cc/150?img=5"
  },
  {
    tempId: 5,
    testimonial: "I was mass-applying to everything and getting nowhere. Career Workbench helped me focus on three roles I actually matched and I landed one.",
    by: "Sarah, Data Analyst",
    imgSrc: "https://i.pravatar.cc/150?img=6"
  },
  {
    tempId: 6,
    testimonial: "The interview prep alone saved me. I walked in knowing exactly which stories to tell.",
    by: "Tomás, Account Executive",
    imgSrc: "https://i.pravatar.cc/150?img=7"
  },
  {
    tempId: 7,
    testimonial: "Switching careers at 34 felt impossible until I uploaded my resume here. Turns out I had more transferable proof than I thought.",
    by: "Rachel, Former Teacher → UX Researcher",
    imgSrc: "https://i.pravatar.cc/150?img=8"
  },
  {
    tempId: 8,
    testimonial: "Spent 20 minutes and had a sharper resume, a cover letter, and a prep sheet. Used to take me an entire Sunday.",
    by: "Kevin, Frontend Developer",
    imgSrc: "https://i.pravatar.cc/150?img=9"
  },
  {
    tempId: 9,
    testimonial: "I didn't believe an AI tool could actually help until I saw the score breakdown. Every suggestion was specific and actionable.",
    by: "Lin, Operations Manager",
    imgSrc: "https://i.pravatar.cc/150?img=10"
  },
  {
    tempId: 10,
    testimonial: "Got my first offer in three years. I'm not saying it's all Career Workbench, but the confidence boost from that score was real.",
    by: "Andre, Mechanical Engineer",
    imgSrc: "https://i.pravatar.cc/150?img=11"
  },
  {
    tempId: 11,
    testimonial: "I recommend Career Workbench to every graduate I mentor. It shows them what recruiters actually look for instead of guessing.",
    by: "Nadia, Bootcamp Instructor",
    imgSrc: "https://i.pravatar.cc/150?img=12"
  },
];

interface TestimonialCardProps {
  position: number;
  testimonial: typeof testimonials[0];
  handleMove: (steps: number) => void;
  cardSize: number;
}

const TestimonialCard: React.FC<TestimonialCardProps> = ({
  position,
  testimonial,
  handleMove,
  cardSize
}) => {
  const isCenter = position === 0;

  return (
    <div
      onClick={() => handleMove(position)}
      className={cn(
        "absolute left-1/2 top-1/2 cursor-pointer rounded-2xl border p-8 transition-all duration-500 ease-in-out",
        isCenter
          ? "z-10 bg-primary text-primary-foreground border-primary/60"
          : "z-0 border-border/40 hover:border-primary/30",
        "testimonial-card"
      )}
      style={{
        width: cardSize,
        height: cardSize,
        background: isCenter ? undefined : 'rgba(255, 255, 255, 0.55)',
        backdropFilter: isCenter ? undefined : 'blur(12px)',
        WebkitBackdropFilter: isCenter ? undefined : 'blur(12px)',
        transform: `
          translate(-50%, -50%)
          translateX(${(cardSize / 1.5) * position}px)
          translateY(${isCenter ? -65 : position % 2 ? 15 : -15}px)
          rotate(${isCenter ? 0 : position % 2 ? 2.5 : -2.5}deg)
        `,
        boxShadow: isCenter
          ? "0 12px 32px rgba(10, 102, 194, 0.18), 0 4px 12px rgba(10, 102, 194, 0.08)"
          : "0 4px 16px rgba(19, 44, 72, 0.06)"
      }}
    >
      <img
        src={testimonial.imgSrc}
        alt={`${testimonial.by.split(',')[0]}`}
        className="mb-4 h-14 w-12 rounded-lg object-cover object-top"
      />
      <h3 className={cn(
        "text-base sm:text-xl font-medium",
        isCenter ? "text-primary-foreground" : "text-foreground"
      )}>
        "{testimonial.testimonial}"
      </h3>
      <p className={cn(
        "absolute bottom-8 left-8 right-8 mt-2 text-sm italic",
        isCenter ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        - {testimonial.by}
      </p>
    </div>
  );
};

export const StaggerTestimonials: React.FC = () => {
  const [cardSize, setCardSize] = useState(365);
  const [testimonialsList, setTestimonialsList] = useState(testimonials);

  const handleMove = (steps: number) => {
    const newList = [...testimonialsList];
    if (steps > 0) {
      for (let i = steps; i > 0; i--) {
        const item = newList.shift();
        if (!item) return;
        newList.push({ ...item, tempId: Math.random() });
      }
    } else {
      for (let i = steps; i < 0; i++) {
        const item = newList.pop();
        if (!item) return;
        newList.unshift({ ...item, tempId: Math.random() });
      }
    }
    setTestimonialsList(newList);
  };

  useEffect(() => {
    const updateSize = () => {
      const { matches } = window.matchMedia("(min-width: 640px)");
      setCardSize(matches ? 365 : 290);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Only render cards near the center to avoid clipping at viewport edges
  const visibleRange = 3; // show 3 cards on each side of center

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 600 }}
    >
      {testimonialsList.map((testimonial, index) => {
        const position = testimonialsList.length % 2
          ? index - (testimonialsList.length + 1) / 2
          : index - testimonialsList.length / 2;
        if (Math.abs(position) > visibleRange) return null;
        return (
          <TestimonialCard
            key={testimonial.tempId}
            testimonial={testimonial}
            handleMove={handleMove}
            position={position}
            cardSize={cardSize}
          />
        );
      })}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <button
          onClick={() => handleMove(-1)}
          className={cn(
            "flex h-11 w-11 items-center justify-center text-lg rounded-full transition-all",
            "bg-white/60 backdrop-blur-sm border border-border/30 text-muted-foreground",
            "hover:bg-white/80 hover:text-foreground hover:shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-label="Previous testimonial"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => handleMove(1)}
          className={cn(
            "flex h-11 w-11 items-center justify-center text-lg rounded-full transition-all",
            "bg-white/60 backdrop-blur-sm border border-border/30 text-muted-foreground",
            "hover:bg-white/80 hover:text-foreground hover:shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-label="Next testimonial"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
